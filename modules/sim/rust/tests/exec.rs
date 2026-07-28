use revm_sim::Fork;
use serde_json::Value;

const CHAIN_ID: u64 = 100;
const BLOCK: u64 = 45_900_000;
const TS: u64 = 1_700_000_000;

const ALICE: &str = "0x1000000000000000000000000000000000000001";
const BOB: &str = "0x1000000000000000000000000000000000000002";
const CONTRACT: &str = "0x1000000000000000000000000000000000000003";

const ONE_ETH: &str = "0xde0b6b3a7640000";

fn fork() -> Fork {
    Fork::new(CHAIN_ID, BLOCK, TS)
}

fn parse(env: String) -> Value {
    serde_json::from_str(&env).expect("envelope is valid JSON")
}

fn tx(from: &str, to: &str, data: &str) -> String {
    format!(r#"{{"from":"{from}","to":"{to}","data":"{data}"}}"#)
}

fn seed_eoa(f: &mut Fork, addr: &str, balance: &str) {
    let env = parse(f.insert_account(addr, balance, 0, "0x"));
    assert_eq!(env["kind"], "ok", "{env}");
}

fn seed_contract(f: &mut Fork, addr: &str, code: &str) {
    let env = parse(f.insert_account(addr, "0x0", 1, code));
    assert_eq!(env["kind"], "ok", "{env}");
}

#[test]
fn transfer_commits_balance_and_nonce() {
    let mut f = fork();
    seed_eoa(&mut f, ALICE, ONE_ETH);
    seed_eoa(&mut f, BOB, "0x0");

    let tx_json = format!(
        r#"{{"from":"{ALICE}","to":"{BOB}","value":"0x6f05b59d3b20000"}}"# // 0.5 ETH
    );
    let env = parse(f.transact(&tx_json));
    assert_eq!(env["kind"], "success", "{env}");

    let alice = parse(f.get_balance(ALICE));
    let bob = parse(f.get_balance(BOB));
    assert_eq!(alice["value"], "0x6f05b59d3b20000");
    assert_eq!(bob["value"], "0x6f05b59d3b20000");

    // Nonce bumped: a second identical transfer succeeds and the journal used
    // the cached nonce (observable via a second successful commit).
    let env = parse(f.transact(&tx_json));
    assert_eq!(env["kind"], "success", "{env}");
    let alice = parse(f.get_balance(ALICE));
    assert_eq!(alice["value"], "0x0");
}

#[test]
fn revert_returns_revert_data() {
    let mut f = fork();
    seed_eoa(&mut f, ALICE, ONE_ETH);
    // PUSH1 0x42 PUSH1 0 MSTORE PUSH1 32 PUSH1 0 REVERT
    seed_contract(&mut f, CONTRACT, "0x604260005260206000fd");

    let env = parse(f.transact(&tx(ALICE, CONTRACT, "0x")));
    assert_eq!(env["kind"], "revert", "{env}");
    let data = env["revertData"].as_str().unwrap();
    assert!(data.ends_with("42"), "revert data carries memory: {data}");
    assert_eq!(data.len(), 2 + 64);
}

#[test]
fn cold_caller_raises_account_miss() {
    let mut f = fork();
    let env = parse(f.transact(&tx(ALICE, BOB, "0x")));
    assert_eq!(env["kind"], "misses", "{env}");
    assert_eq!(env["misses"][0]["type"], "account");
    assert_eq!(
        env["misses"][0]["address"].as_str().unwrap().to_lowercase(),
        ALICE
    );
}

#[test]
fn cold_storage_raises_storage_miss_then_converges() {
    let mut f = fork();
    seed_eoa(&mut f, ALICE, ONE_ETH);
    // PUSH1 0 SLOAD PUSH1 0 MSTORE PUSH1 32 PUSH1 0 RETURN
    seed_contract(&mut f, CONTRACT, "0x60005460005260206000f3");

    let env = parse(f.transact(&tx(ALICE, CONTRACT, "0x")));
    assert_eq!(env["kind"], "misses", "{env}");
    assert_eq!(env["misses"][0]["type"], "storage");
    assert_eq!(env["misses"][0]["slot"], "0x0");

    let env = parse(f.insert_storage(CONTRACT, "0x0", "0xab"));
    assert_eq!(env["kind"], "ok", "{env}");

    let env = parse(f.transact(&tx(ALICE, CONTRACT, "0x")));
    assert_eq!(env["kind"], "success", "{env}");
    assert!(env["returnData"].as_str().unwrap().ends_with("ab"));
}

#[test]
fn blockhash_miss_and_resolution() {
    let mut f = fork();
    seed_eoa(&mut f, ALICE, ONE_ETH);
    // PUSH1 1 NUMBER SUB BLOCKHASH PUSH1 0 MSTORE PUSH1 32 PUSH1 0 RETURN
    seed_contract(&mut f, CONTRACT, "0x600143034060005260206000f3");

    let env = parse(f.transact(&tx(ALICE, CONTRACT, "0x")));
    assert_eq!(env["kind"], "misses", "{env}");
    assert_eq!(env["misses"][0]["type"], "blockhash");
    assert_eq!(env["misses"][0]["number"], BLOCK - 1);

    let hash = format!("0x{}", "11".repeat(32));
    let env = parse(f.insert_block_hash(BLOCK - 1, &hash));
    assert_eq!(env["kind"], "ok", "{env}");

    let env = parse(f.transact(&tx(ALICE, CONTRACT, "0x")));
    assert_eq!(env["kind"], "success", "{env}");
    assert_eq!(env["returnData"].as_str().unwrap(), hash);
}

#[test]
fn eip7702_delegation_designator_executes_target_code() {
    let mut f = fork();
    let target = CONTRACT;
    seed_eoa(&mut f, ALICE, ONE_ETH);
    // Target: PUSH1 0x2a PUSH1 0 MSTORE PUSH1 32 PUSH1 0 RETURN
    seed_contract(&mut f, target, "0x602a60005260206000f3");

    // Delegate ALICE to the target, as the batched-action path does.
    let designator = format!("0xef0100{}", &target[2..]);
    let env = parse(f.set_code(ALICE, &designator));
    assert_eq!(env["kind"], "ok", "{env}");

    // A call to ALICE now executes the delegated code.
    let env = parse(f.transact(&tx(BOB, ALICE, "0x")));
    // BOB is cold — seed and retry (mirrors the TS replay loop).
    assert_eq!(env["kind"], "misses", "{env}");
    seed_eoa(&mut f, BOB, ONE_ETH);
    let env = parse(f.transact(&tx(BOB, ALICE, "0x")));
    assert_eq!(env["kind"], "success", "{env}");
    assert!(env["returnData"].as_str().unwrap().ends_with("2a"));
}

#[test]
fn call_does_not_commit_but_transact_does() {
    let mut f = fork();
    seed_eoa(&mut f, ALICE, ONE_ETH);
    // PUSH1 1 PUSH1 0 SSTORE STOP
    seed_contract(&mut f, CONTRACT, "0x600160005500");

    // Cold slot 0 read by SSTORE accounting — resolve the miss first.
    let env = parse(f.call(&tx(ALICE, CONTRACT, "0x")));
    assert_eq!(env["kind"], "misses", "{env}");
    let env = parse(f.insert_storage(CONTRACT, "0x0", "0x0"));
    assert_eq!(env["kind"], "ok", "{env}");

    let env = parse(f.call(&tx(ALICE, CONTRACT, "0x")));
    assert_eq!(env["kind"], "success", "{env}");
    let stored = parse(f.get_storage(CONTRACT, "0x0"));
    assert_eq!(stored["value"], "0x0", "call must not persist state");

    let env = parse(f.transact(&tx(ALICE, CONTRACT, "0x")));
    assert_eq!(env["kind"], "success", "{env}");
    let stored = parse(f.get_storage(CONTRACT, "0x0"));
    assert_eq!(stored["value"], "0x1", "transact must persist state");
}

#[test]
fn cheatcodes_mutate_cached_state() {
    let mut f = fork();
    seed_eoa(&mut f, ALICE, "0x0");

    let env = parse(f.set_balance(ALICE, ONE_ETH));
    assert_eq!(env["kind"], "ok", "{env}");
    assert_eq!(parse(f.get_balance(ALICE))["value"], ONE_ETH);

    let env = parse(f.set_code(ALICE, "0x6000"));
    assert_eq!(env["kind"], "ok", "{env}");
    assert_eq!(parse(f.get_code(ALICE))["value"], "0x6000");

    // set_balance on a cold account misses (needs upstream nonce/code first).
    let env = parse(f.set_balance(BOB, ONE_ETH));
    assert_eq!(env["kind"], "misses", "{env}");
}

#[test]
fn mine_and_increase_time_shift_block_context() {
    let mut f = fork();
    seed_eoa(&mut f, ALICE, ONE_ETH);
    // TIMESTAMP PUSH1 0 MSTORE NUMBER PUSH1 32 MSTORE PUSH1 64 PUSH1 0 RETURN
    seed_contract(&mut f, CONTRACT, "0x426000524360205260406000f3");

    assert_eq!(f.block_number(), BLOCK);
    f.mine(3);
    f.increase_time(3600);
    assert_eq!(f.block_number(), BLOCK + 3);

    let env = parse(f.call(&tx(ALICE, CONTRACT, "0x")));
    assert_eq!(env["kind"], "success", "{env}");
    let data = env["returnData"].as_str().unwrap();
    let ts = u64::from_str_radix(&data[2..66], 16).unwrap();
    let num = u64::from_str_radix(&data[66..130], 16).unwrap();
    assert_eq!(ts, TS + 3600);
    assert_eq!(num, BLOCK + 3);
}

#[test]
fn malformed_inputs_return_error_envelopes() {
    let mut f = fork();
    assert_eq!(parse(f.transact("not json"))["kind"], "error");
    assert_eq!(parse(f.transact(r#"{"from":"0xzz"}"#))["kind"], "error");
    assert_eq!(parse(f.insert_account("0x123", "0x0", 0, "0x"))["kind"], "error");
    assert_eq!(parse(f.get_balance("bogus"))["kind"], "error");
}
