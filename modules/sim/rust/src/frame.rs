//! A module simulation's added opcodes and its top-level call, for revm.
//!
//! The opcodes' meaning is the host's (the TS executor): each added byte
//! pops its operands, asks the hook installed for the call, and applies the
//! answer (push, write memory, end the frame like RETURN, or fail like an
//! invalid opcode). An instruction is a plain `fn`, so the hook lives in a
//! thread-local for the duration of one call.

use std::cell::RefCell;
use std::collections::HashMap;

use revm::context::ContextTr;
use revm::interpreter::instructions::system::copy_cost_and_memory_resize;
use revm::interpreter::interpreter::EthInterpreter;
use revm::interpreter::interpreter_types::{InputsTr, Jumps, LoopControl, RuntimeFlag};
use revm::context::JournalTr;
use revm::interpreter::{
    CallInputs, CallOutcome, CreateInputs, CreateOutcome, Host, InstructionContext,
    InstructionResult, Interpreter, InterpreterAction,
};
use revm::primitives::{b256, Address, Bytes, Log, LogData, B256, U256};
use revm::Inspector;

/// What an added opcode is given.
pub struct OpIn<'a> {
    pub op: u8,
    pub address: Address,
    pub is_static: bool,
    pub operands: &'a [U256],
}

/// What it answers.
pub enum OpOut {
    Push(U256),
    Write(U256, Vec<u8>),
    Return(U256, U256),
    Fail(String),
}

pub type Hook<'a> = dyn FnMut(OpIn) -> OpOut + 'a;

struct Installed {
    pops: HashMap<u8, usize>,
    hook: *mut Hook<'static>,
    failure: Option<String>,
}

thread_local! {
    static INSTALLED: RefCell<Option<Installed>> = const { RefCell::new(None) };
}

/// Runs `run` with `hook` answering the bytes of `pops` (byte → operands).
pub fn with_hook<R>(pops: HashMap<u8, usize>, hook: &mut Hook<'_>, run: impl FnOnce() -> R) -> (R, Option<String>) {
    // The hook outlives the call it is installed for: it is removed below,
    // before `hook`'s borrow ends.
    let ptr: *mut Hook<'static> = unsafe { std::mem::transmute(hook as *mut Hook<'_>) };
    INSTALLED.with(|i| {
        *i.borrow_mut() = Some(Installed { pops, hook: ptr, failure: None })
    });
    // Removed however `run` ends, a panic included: no hook outlives its call.
    struct Uninstall;
    impl Drop for Uninstall {
        fn drop(&mut self) {
            let _ = INSTALLED.try_with(|i| i.borrow_mut().take());
        }
    }
    let guard = Uninstall;
    let result = run();
    let failure = INSTALLED.with(|i| i.borrow_mut().take()).and_then(|i| i.failure);
    drop(guard);
    (result, failure)
}

/// The instruction for byte `OP`: unknown unless a hook answers it.
pub fn frame_op<const OP: u8, H: Host + ?Sized>(
    ctx: InstructionContext<'_, H, EthInterpreter>,
) -> Result<(), InstructionResult> {
    let installed = INSTALLED.with(|i| {
        i.borrow()
            .as_ref()
            .and_then(|i| i.pops.get(&OP).map(|pops| (*pops, i.hook)))
    });
    let Some((pops, hook)) = installed else {
        return Err(InstructionResult::OpcodeNotFound);
    };
    let interpreter = ctx.interpreter;
    let mut operands = Vec::with_capacity(pops);
    for _ in 0..pops {
        operands.push(interpreter.stack.pop()?);
    }
    let input = OpIn {
        op: OP,
        address: interpreter.input.target_address(),
        is_static: interpreter.runtime_flag.is_static(),
        operands: &operands,
    };
    // SAFETY: installed by `with_hook` for the duration of this call, and
    // only this thread runs it.
    let answer = unsafe { (*hook)(input) };
    match answer {
        OpOut::Push(value) => {
            if interpreter.stack.push(value) {
                Ok(())
            } else {
                Err(InstructionResult::StackOverflow)
            }
        }
        OpOut::Write(offset, data) => {
            let Some(offset) =
                copy_cost_and_memory_resize(interpreter, ctx.host.gas_params(), offset, data.len())?
            else {
                return Ok(());
            };
            interpreter.memory.set(offset, &data);
            Ok(())
        }
        OpOut::Return(offset, size) => {
            let size: usize = size.try_into().map_err(|_| InstructionResult::InvalidOperandOOG)?;
            let mut output = Bytes::default();
            if size != 0 {
                let offset: usize =
                    offset.try_into().map_err(|_| InstructionResult::InvalidOperandOOG)?;
                interpreter.resize_memory(ctx.host.gas_params(), offset, size)?;
                output = interpreter.memory.slice_len(offset, size).to_vec().into();
            }
            interpreter.bytecode.set_action(InterpreterAction::new_return(
                InstructionResult::Return,
                output,
                interpreter.gas,
            ));
            Err(InstructionResult::Return)
        }
        OpOut::Fail(message) => {
            INSTALLED.with(|i| {
                if let Some(i) = i.borrow_mut().as_mut() {
                    i.failure = Some(message);
                }
            });
            Err(InstructionResult::OpcodeNotFound)
        }
    }
}

/// `frame_op` for every byte, indexed by it (an instruction's byte is a
/// const parameter).
pub fn frame_ops<H: Host + ?Sized>() -> [fn(InstructionContext<'_, H, EthInterpreter>) -> Result<(), InstructionResult>; 256] {
    [
        frame_op::<0, H>,
        frame_op::<1, H>,
        frame_op::<2, H>,
        frame_op::<3, H>,
        frame_op::<4, H>,
        frame_op::<5, H>,
        frame_op::<6, H>,
        frame_op::<7, H>,
        frame_op::<8, H>,
        frame_op::<9, H>,
        frame_op::<10, H>,
        frame_op::<11, H>,
        frame_op::<12, H>,
        frame_op::<13, H>,
        frame_op::<14, H>,
        frame_op::<15, H>,
        frame_op::<16, H>,
        frame_op::<17, H>,
        frame_op::<18, H>,
        frame_op::<19, H>,
        frame_op::<20, H>,
        frame_op::<21, H>,
        frame_op::<22, H>,
        frame_op::<23, H>,
        frame_op::<24, H>,
        frame_op::<25, H>,
        frame_op::<26, H>,
        frame_op::<27, H>,
        frame_op::<28, H>,
        frame_op::<29, H>,
        frame_op::<30, H>,
        frame_op::<31, H>,
        frame_op::<32, H>,
        frame_op::<33, H>,
        frame_op::<34, H>,
        frame_op::<35, H>,
        frame_op::<36, H>,
        frame_op::<37, H>,
        frame_op::<38, H>,
        frame_op::<39, H>,
        frame_op::<40, H>,
        frame_op::<41, H>,
        frame_op::<42, H>,
        frame_op::<43, H>,
        frame_op::<44, H>,
        frame_op::<45, H>,
        frame_op::<46, H>,
        frame_op::<47, H>,
        frame_op::<48, H>,
        frame_op::<49, H>,
        frame_op::<50, H>,
        frame_op::<51, H>,
        frame_op::<52, H>,
        frame_op::<53, H>,
        frame_op::<54, H>,
        frame_op::<55, H>,
        frame_op::<56, H>,
        frame_op::<57, H>,
        frame_op::<58, H>,
        frame_op::<59, H>,
        frame_op::<60, H>,
        frame_op::<61, H>,
        frame_op::<62, H>,
        frame_op::<63, H>,
        frame_op::<64, H>,
        frame_op::<65, H>,
        frame_op::<66, H>,
        frame_op::<67, H>,
        frame_op::<68, H>,
        frame_op::<69, H>,
        frame_op::<70, H>,
        frame_op::<71, H>,
        frame_op::<72, H>,
        frame_op::<73, H>,
        frame_op::<74, H>,
        frame_op::<75, H>,
        frame_op::<76, H>,
        frame_op::<77, H>,
        frame_op::<78, H>,
        frame_op::<79, H>,
        frame_op::<80, H>,
        frame_op::<81, H>,
        frame_op::<82, H>,
        frame_op::<83, H>,
        frame_op::<84, H>,
        frame_op::<85, H>,
        frame_op::<86, H>,
        frame_op::<87, H>,
        frame_op::<88, H>,
        frame_op::<89, H>,
        frame_op::<90, H>,
        frame_op::<91, H>,
        frame_op::<92, H>,
        frame_op::<93, H>,
        frame_op::<94, H>,
        frame_op::<95, H>,
        frame_op::<96, H>,
        frame_op::<97, H>,
        frame_op::<98, H>,
        frame_op::<99, H>,
        frame_op::<100, H>,
        frame_op::<101, H>,
        frame_op::<102, H>,
        frame_op::<103, H>,
        frame_op::<104, H>,
        frame_op::<105, H>,
        frame_op::<106, H>,
        frame_op::<107, H>,
        frame_op::<108, H>,
        frame_op::<109, H>,
        frame_op::<110, H>,
        frame_op::<111, H>,
        frame_op::<112, H>,
        frame_op::<113, H>,
        frame_op::<114, H>,
        frame_op::<115, H>,
        frame_op::<116, H>,
        frame_op::<117, H>,
        frame_op::<118, H>,
        frame_op::<119, H>,
        frame_op::<120, H>,
        frame_op::<121, H>,
        frame_op::<122, H>,
        frame_op::<123, H>,
        frame_op::<124, H>,
        frame_op::<125, H>,
        frame_op::<126, H>,
        frame_op::<127, H>,
        frame_op::<128, H>,
        frame_op::<129, H>,
        frame_op::<130, H>,
        frame_op::<131, H>,
        frame_op::<132, H>,
        frame_op::<133, H>,
        frame_op::<134, H>,
        frame_op::<135, H>,
        frame_op::<136, H>,
        frame_op::<137, H>,
        frame_op::<138, H>,
        frame_op::<139, H>,
        frame_op::<140, H>,
        frame_op::<141, H>,
        frame_op::<142, H>,
        frame_op::<143, H>,
        frame_op::<144, H>,
        frame_op::<145, H>,
        frame_op::<146, H>,
        frame_op::<147, H>,
        frame_op::<148, H>,
        frame_op::<149, H>,
        frame_op::<150, H>,
        frame_op::<151, H>,
        frame_op::<152, H>,
        frame_op::<153, H>,
        frame_op::<154, H>,
        frame_op::<155, H>,
        frame_op::<156, H>,
        frame_op::<157, H>,
        frame_op::<158, H>,
        frame_op::<159, H>,
        frame_op::<160, H>,
        frame_op::<161, H>,
        frame_op::<162, H>,
        frame_op::<163, H>,
        frame_op::<164, H>,
        frame_op::<165, H>,
        frame_op::<166, H>,
        frame_op::<167, H>,
        frame_op::<168, H>,
        frame_op::<169, H>,
        frame_op::<170, H>,
        frame_op::<171, H>,
        frame_op::<172, H>,
        frame_op::<173, H>,
        frame_op::<174, H>,
        frame_op::<175, H>,
        frame_op::<176, H>,
        frame_op::<177, H>,
        frame_op::<178, H>,
        frame_op::<179, H>,
        frame_op::<180, H>,
        frame_op::<181, H>,
        frame_op::<182, H>,
        frame_op::<183, H>,
        frame_op::<184, H>,
        frame_op::<185, H>,
        frame_op::<186, H>,
        frame_op::<187, H>,
        frame_op::<188, H>,
        frame_op::<189, H>,
        frame_op::<190, H>,
        frame_op::<191, H>,
        frame_op::<192, H>,
        frame_op::<193, H>,
        frame_op::<194, H>,
        frame_op::<195, H>,
        frame_op::<196, H>,
        frame_op::<197, H>,
        frame_op::<198, H>,
        frame_op::<199, H>,
        frame_op::<200, H>,
        frame_op::<201, H>,
        frame_op::<202, H>,
        frame_op::<203, H>,
        frame_op::<204, H>,
        frame_op::<205, H>,
        frame_op::<206, H>,
        frame_op::<207, H>,
        frame_op::<208, H>,
        frame_op::<209, H>,
        frame_op::<210, H>,
        frame_op::<211, H>,
        frame_op::<212, H>,
        frame_op::<213, H>,
        frame_op::<214, H>,
        frame_op::<215, H>,
        frame_op::<216, H>,
        frame_op::<217, H>,
        frame_op::<218, H>,
        frame_op::<219, H>,
        frame_op::<220, H>,
        frame_op::<221, H>,
        frame_op::<222, H>,
        frame_op::<223, H>,
        frame_op::<224, H>,
        frame_op::<225, H>,
        frame_op::<226, H>,
        frame_op::<227, H>,
        frame_op::<228, H>,
        frame_op::<229, H>,
        frame_op::<230, H>,
        frame_op::<231, H>,
        frame_op::<232, H>,
        frame_op::<233, H>,
        frame_op::<234, H>,
        frame_op::<235, H>,
        frame_op::<236, H>,
        frame_op::<237, H>,
        frame_op::<238, H>,
        frame_op::<239, H>,
        frame_op::<240, H>,
        frame_op::<241, H>,
        frame_op::<242, H>,
        frame_op::<243, H>,
        frame_op::<244, H>,
        frame_op::<245, H>,
        frame_op::<246, H>,
        frame_op::<247, H>,
        frame_op::<248, H>,
        frame_op::<249, H>,
        frame_op::<250, H>,
        frame_op::<251, H>,
        frame_op::<252, H>,
        frame_op::<253, H>,
        frame_op::<254, H>,
        frame_op::<255, H>,
    ]
}

/// Gives the top-level call the frame's gas and static flag (a transaction
/// has neither), and records the execution gas it spent.
pub struct FrameInspector {
    pub gas: u64,
    pub is_static: bool,
    pub spent: Option<u64>,
    depth: usize,
    /// EIP-7708: log every value transfer to another account.
    transfer_logs: bool,
    /// Per open call or create: where its transfer log is, if it logged one.
    logged: Vec<Option<usize>>,
    /// Per open call or create: the SELFDESTRUCT it ended with that moved
    /// value to another account (logged once the frame returns).
    destructed: Vec<Option<(Address, Address, U256)>>,
    /// EIP-8141: what is left of the frame's own state-gas pool
    /// (`limits.state`), on a network whose frames run EIP-8037. Every state
    /// charge draws on it, and one it cannot cover halts the call as out of
    /// gas; it only shrinks (ethrex): a refill or a reverted call's charges
    /// go back to a reservoir frames do not draw from. revm's own reservoir
    /// is made too large to run out, and its drops are the charges.
    state_pool: Option<u64>,
    /// The state gas the top call used (0 when it failed: rolled back).
    pub state_spent: u64,
    /// The top call's refund counter, before any cap (0 when it failed).
    pub refund: u64,
    /// Per open call or create: whether it runs init code.
    creating: Vec<bool>,
    /// revm's reservoir before the current step.
    reservoir_before: u64,
    /// The frame's target, to make cold again at its first step: ethrex
    /// does not warm a frame's target (revm warms a call's destination).
    cool: Option<Address>,
    /// Cost per state byte (EIP-8037), for a create's code deposit.
    cpsb: u64,
}

/// A reservoir no frame can drain (the frame's pool is kept by the inspector).
const UNBOUNDED_RESERVOIR: u64 = 1 << 62;

/// EIP-7708: the log's address, and `keccak256("Transfer(address,address,uint256)")`.
const SYSTEM_ADDRESS: Address = Address::new([
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xfe,
]);
const TRANSFER_TOPIC: B256 =
    b256!("ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");

fn transfer_log(from: Address, to: Address, value: U256) -> Log {
    Log {
        address: SYSTEM_ADDRESS,
        data: LogData::new(
            vec![
                TRANSFER_TOPIC,
                B256::left_padding_from(from.as_slice()),
                B256::left_padding_from(to.as_slice()),
            ],
            Bytes::copy_from_slice(&value.to_be_bytes::<32>()),
        )
        .expect("3 topics"),
    }
}

impl FrameInspector {
    pub fn new(gas: u64, is_static: bool, transfer_logs: bool) -> Self {
        FrameInspector {
            gas,
            is_static,
            spent: None,
            depth: 0,
            transfer_logs,
            logged: Vec::new(),
            destructed: Vec::new(),
            state_pool: None,
            state_spent: 0,
            refund: 0,
            creating: Vec::new(),
            reservoir_before: 0,
            cool: None,
            cpsb: 0,
        }
    }

    /// Leaves the frame's `target` cold, as ethrex does, unless an earlier
    /// frame warmed it.
    pub fn with_cold_target(mut self, target: Address) -> Self {
        self.cool = Some(target);
        self
    }

    /// Draws the frame's state charges from `pool` alone (EIP-8141), at
    /// `cpsb` gas per state byte.
    pub fn with_state_pool(mut self, pool: u64, cpsb: u64) -> Self {
        self.state_pool = Some(pool);
        self.cpsb = cpsb;
        self
    }

    /// Logs a transfer where the value moves; returns where the log is.
    fn log_transfer<CTX: ContextTr>(
        &self,
        context: &mut CTX,
        from: Address,
        to: Address,
        value: U256,
    ) -> Option<usize> {
        if !self.transfer_logs || value.is_zero() || from == to {
            return None;
        }
        let at = context.journal_mut().logs().len();
        context.journal_mut().log(transfer_log(from, to, value));
        Some(at)
    }

    /// A frame returned: a failed one takes its transfer log back (revm
    /// reverted the transfer), a SELFDESTRUCT that moved value logs it.
    fn frame_end<CTX: ContextTr>(&mut self, context: &mut CTX, ok: bool) {
        let logged = self.logged.pop().flatten();
        let destructed = self.destructed.pop().flatten();
        if !ok {
            if let Some(at) = logged {
                let journal = context.journal_mut();
                let mut logs = journal.take_logs();
                logs.truncate(at);
                for log in logs {
                    journal.log(log);
                }
            }
        } else if let Some((from, to, value)) = destructed {
            self.log_transfer(context, from, to, value);
        }
    }
}

impl<CTX> Inspector<CTX, EthInterpreter> for FrameInspector
where
    CTX: ContextTr,
    CTX::Journal: JournalTr<State = revm::state::EvmState>,
{
    fn step(&mut self, interp: &mut Interpreter<EthInterpreter>, context: &mut CTX) {
        if let Some(target) = self.cool.take() {
            if let Some(account) = context.journal_mut().evm_state_mut().get_mut(&target) {
                account.mark_cold();
            }
        }
        let Some(pool) = self.state_pool else {
            return;
        };
        self.reservoir_before = interp.gas.reservoir();
        // RETURN from init code deposits the code, outside any step: its
        // state gas is charged to the pool here, and a pool that cannot pay
        // it halts the create (as a failed charge does).
        if interp.bytecode.opcode() == 0xf3 && self.creating.last() == Some(&true) {
            let data = interp.stack.data();
            if data.len() >= 2 {
                let size = data[data.len() - 2];
                let cost = size.saturating_mul(U256::from(self.cpsb));
                match u64::try_from(cost) {
                    Ok(cost) if cost <= pool => self.state_pool = Some(pool - cost),
                    _ => interp.halt_oog(),
                }
            }
        }
    }

    fn step_end(&mut self, interp: &mut Interpreter<EthInterpreter>, _context: &mut CTX) {
        let Some(pool) = self.state_pool else {
            return;
        };
        let after = interp.gas.reservoir();
        if after < self.reservoir_before {
            let charged = self.reservoir_before - after;
            if charged > pool {
                interp.halt_oog();
            } else {
                self.state_pool = Some(pool - charged);
            }
        }
    }

    fn call(&mut self, context: &mut CTX, inputs: &mut CallInputs) -> Option<CallOutcome> {
        if self.depth == 0 {
            inputs.is_static = self.is_static;
            inputs.gas_limit = self.gas;
            if self.state_pool.is_some() {
                inputs.reservoir = UNBOUNDED_RESERVOIR;
            }
        }
        self.depth += 1;
        self.creating.push(false);
        let logged = match inputs.transfer_value() {
            Some(value) => {
                self.log_transfer(context, inputs.transfer_from(), inputs.transfer_to(), value)
            }
            None => None,
        };
        self.logged.push(logged);
        self.destructed.push(None);
        None
    }

    fn call_end(&mut self, context: &mut CTX, _inputs: &CallInputs, outcome: &mut CallOutcome) {
        self.depth -= 1;
        self.creating.pop();
        if self.depth == 0 {
            self.spent = Some(outcome.result.gas.total_gas_spent());
            if outcome.result.result.is_ok() {
                self.state_spent = outcome.result.gas.state_gas_spent().max(0) as u64;
                self.refund = outcome.result.gas.refunded().max(0) as u64;
            }
        }
        self.frame_end(context, outcome.result.result.is_ok());
    }

    fn create(&mut self, context: &mut CTX, inputs: &mut CreateInputs) -> Option<CreateOutcome> {
        let caller = inputs.caller();
        let nonce = context
            .journal_mut()
            .load_account(caller)
            .map(|a| a.data.info.nonce)
            .unwrap_or(0);
        let created = inputs.created_address(nonce);
        // A caller whose nonce cannot grow creates nothing and moves no value
        // (revm ends that CREATE without a failure for create_end to see).
        let logged = if nonce == u64::MAX {
            None
        } else {
            self.log_transfer(context, caller, created, inputs.value())
        };
        self.logged.push(logged);
        self.destructed.push(None);
        self.creating.push(true);
        None
    }

    fn create_end(&mut self, context: &mut CTX, _inputs: &CreateInputs, outcome: &mut CreateOutcome) {
        self.creating.pop();
        self.frame_end(context, outcome.result.result.is_ok());
    }

    fn selfdestruct(&mut self, contract: Address, target: Address, value: U256) {
        if let Some(last) = self.destructed.last_mut() {
            *last = Some((contract, target, value));
        }
    }
}

