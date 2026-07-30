/**
 * The snarkjs Solidity verifier templates, vendored as string constants so
 * `zKey.exportSolidityVerifier` works in the browser and under bun (the
 * snarkjs CLI reads them from disk, which neither bundlers nor bun tests
 * can rely on).
 *
 * Vendored from snarkjs@0.7.6 templates/ (GPL-3.0, iden3). Re-vendor when
 * bumping the snarkjs dependency.
 */

export const GROTH16_VERIFIER_TEMPLATE = `// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16Verifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = <%= vk_alpha_1[0]    %>;
    uint256 constant alphay  = <%= vk_alpha_1[1]    %>;
    uint256 constant betax1  = <%= vk_beta_2[0][1]  %>;
    uint256 constant betax2  = <%= vk_beta_2[0][0]  %>;
    uint256 constant betay1  = <%= vk_beta_2[1][1]  %>;
    uint256 constant betay2  = <%= vk_beta_2[1][0]  %>;
    uint256 constant gammax1 = <%= vk_gamma_2[0][1] %>;
    uint256 constant gammax2 = <%= vk_gamma_2[0][0] %>;
    uint256 constant gammay1 = <%= vk_gamma_2[1][1] %>;
    uint256 constant gammay2 = <%= vk_gamma_2[1][0] %>;
    uint256 constant deltax1 = <%= vk_delta_2[0][1] %>;
    uint256 constant deltax2 = <%= vk_delta_2[0][0] %>;
    uint256 constant deltay1 = <%= vk_delta_2[1][1] %>;
    uint256 constant deltay2 = <%= vk_delta_2[1][0] %>;

    <% for (let i=0; i<IC.length; i++) { %>
    uint256 constant IC<%=i%>x = <%=IC[i][0]%>;
    uint256 constant IC<%=i%>y = <%=IC[i][1]%>;
    <% } %>
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[<%=IC.length-1%>] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                <% for (let i = 1; i <= nPublic; i++) { %>
                g1_mulAccC(_pVk, IC<%=i%>x, IC<%=i%>y, calldataload(add(pubSignals, <%=(i-1)*32%>)))
                <% } %>

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            <% for (let i=0; i<nPublic; i++) { %>
            checkField(calldataload(add(_pubSignals, <%=i*32%>)))
            <% } %>

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
`;

export const PLONK_VERIFIER_TEMPLATE = `// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/


pragma solidity >=0.7.0 <0.9.0;

contract PlonkVerifier {
    // Omega
    uint256 constant w1 = <%=w%>;    
    // Scalar field size
    uint256 constant q  = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant qf = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    
    // [1]_1
    uint256 constant G1x = 1;
    uint256 constant G1y = 2;
    // [1]_2
    uint256 constant G2x1 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant G2x2 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant G2y1 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant G2y2 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    
    // Verification Key data
    uint32 constant n         = <%=2**power%>;
    uint16 constant nPublic   = <%=nPublic%>;
    uint16 constant nLagrange = <%=Math.max(nPublic, 1)%>;
    
    uint256 constant Qmx  = <%=Qm[0]%>;
    uint256 constant Qmy  = <%=Qm[0] == "0" ? "0" : Qm[1]%>;
    uint256 constant Qlx  = <%=Ql[0]%>;
    uint256 constant Qly  = <%=Ql[0] == "0" ? "0" : Ql[1]%>;
    uint256 constant Qrx  = <%=Qr[0]%>;
    uint256 constant Qry  = <%=Qr[0] == "0" ? "0" : Qr[1]%>;
    uint256 constant Qox  = <%=Qo[0]%>;
    uint256 constant Qoy  = <%=Qo[0] == "0" ? "0" : Qo[1]%>;
    uint256 constant Qcx  = <%=Qc[0]%>;
    uint256 constant Qcy  = <%=Qc[0] == "0" ? "0" : Qc[1]%>;
    uint256 constant S1x  = <%=S1[0]%>;
    uint256 constant S1y  = <%=S1[0] == "0" ? "0" : S1[1]%>;
    uint256 constant S2x  = <%=S2[0]%>;
    uint256 constant S2y  = <%=S2[0] == "0" ? "0" : S2[1]%>;
    uint256 constant S3x  = <%=S3[0]%>;
    uint256 constant S3y  = <%=S3[0] == "0" ? "0" : S3[1]%>;
    uint256 constant k1   = <%=k1%>;
    uint256 constant k2   = <%=k2%>;
    uint256 constant X2x1 = <%=X_2[0][0]%>;
    uint256 constant X2x2 = <%=X_2[0][1]%>;
    uint256 constant X2y1 = <%=X_2[1][0]%>;
    uint256 constant X2y2 = <%=X_2[1][1]%>;
    
    // Proof calldata
    // Byte offset of every parameter of the calldata
    // Polynomial commitments
    uint16 constant pA       = 4 + 0;
    uint16 constant pB       = 4 + 64;
    uint16 constant pC       = 4 + 128;
    uint16 constant pZ       = 4 + 192;
    uint16 constant pT1      = 4 + 256;
    uint16 constant pT2      = 4 + 320;
    uint16 constant pT3      = 4 + 384;
    uint16 constant pWxi     = 4 + 448;
    uint16 constant pWxiw    = 4 + 512;
    // Opening evaluations
    uint16 constant pEval_a  = 4 + 576;
    uint16 constant pEval_b  = 4 + 608;
    uint16 constant pEval_c  = 4 + 640;
    uint16 constant pEval_s1 = 4 + 672;
    uint16 constant pEval_s2 = 4 + 704;
    uint16 constant pEval_zw = 4 + 736;
    
    // Memory data
    // Challenges
    uint16 constant pAlpha  = 0;
    uint16 constant pBeta   = 32;
    uint16 constant pGamma  = 64;
    uint16 constant pXi     = 96;
    uint16 constant pXin    = 128;
    uint16 constant pBetaXi = 160;
    uint16 constant pV1     = 192;
    uint16 constant pV2     = 224;
    uint16 constant pV3     = 256;
    uint16 constant pV4     = 288;
    uint16 constant pV5     = 320;
    uint16 constant pU      = 352;
    
    uint16 constant pPI      = 384;
    uint16 constant pEval_r0 = 416;
    uint16 constant pD       = 448;
    uint16 constant pF       = 512;
    uint16 constant pE       = 576;
    uint16 constant pTmp     = 640;
    uint16 constant pAlpha2  = 704;
    uint16 constant pZh      = 736;
    uint16 constant pZhInv   = 768;

    <% for (let i=1; i<=Math.max(nPublic, 1); i++) { %>
    uint16 constant pEval_l<%=i%> = <%=768+i*32%>;
    <% } %>
    <% let pLastMem = 800+32*Math.max(nPublic,1) %>
    
    uint16 constant lastMem = <%=pLastMem%>;

    function verifyProof(uint256[24] calldata _proof, uint256[<%=nPublic%>] calldata _pubSignals) public view returns (bool) {
        assembly {
            /////////
            // Computes the inverse using the extended euclidean algorithm
            /////////
            function inverse(a, q) -> inv {
                let t := 0     
                let newt := 1
                let r := q     
                let newr := a
                let quotient
                let aux
                
                for { } newr { } {
                    quotient := sdiv(r, newr)
                    aux := sub(t, mul(quotient, newt))
                    t:= newt
                    newt:= aux
                    
                    aux := sub(r,mul(quotient, newr))
                    r := newr
                    newr := aux
                }
                
                if gt(r, 1) { revert(0,0) }
                if slt(t, 0) { t:= add(t, q) }

                inv := t
            }
            
            ///////
            // Computes the inverse of an array of values
            // See https://vitalik.ca/general/2018/07/21/starks_part_3.html in section where explain fields operations
            //////
            function inverseArray(pVals, n) {
    
                let pAux := mload(0x40)     // Point to the next free position
                let pIn := pVals
                let lastPIn := add(pVals, mul(n, 32))  // Read n elements
                let acc := mload(pIn)       // Read the first element
                pIn := add(pIn, 32)         // Point to the second element
                let inv
    
                
                for { } lt(pIn, lastPIn) { 
                    pAux := add(pAux, 32) 
                    pIn := add(pIn, 32)
                } 
                {
                    mstore(pAux, acc)
                    acc := mulmod(acc, mload(pIn), q)
                }
                acc := inverse(acc, q)
                
                // At this point pAux pint to the next free position we subtract 1 to point to the last used
                pAux := sub(pAux, 32)
                // pIn points to the n+1 element, we subtract to point to n
                pIn := sub(pIn, 32)
                lastPIn := pVals  // We don't process the first element 
                for { } gt(pIn, lastPIn) { 
                    pAux := sub(pAux, 32) 
                    pIn := sub(pIn, 32)
                } 
                {
                    inv := mulmod(acc, mload(pAux), q)
                    acc := mulmod(acc, mload(pIn), q)
                    mstore(pIn, inv)
                }
                // pIn points to first element, we just set it.
                mstore(pIn, acc)
            }
            
            function checkField(v) {
                if iszero(lt(v, q)) {
                    mstore(0, 0)
                    return(0,0x20)
                }
            }
            
            function checkPointBelongsToBN128Curve(p) {
                let x := calldataload(p)
                let y := calldataload(add(p, 32))

                // Check that the point is on the curve
                // y^2 = x^3 + 3
                let x3_3 := addmod(mulmod(x, mulmod(x, x, qf), qf), 3, qf)
                let y2 := mulmod(y, y, qf)

                if iszero(eq(x3_3, y2)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }  

            function checkProofData() {
                // Check proof commitments belong to the bn128 curve
                checkPointBelongsToBN128Curve(pA)
                checkPointBelongsToBN128Curve(pB)
                checkPointBelongsToBN128Curve(pC)
                checkPointBelongsToBN128Curve(pZ)
                checkPointBelongsToBN128Curve(pT1)
                checkPointBelongsToBN128Curve(pT2)
                checkPointBelongsToBN128Curve(pT3)
                checkPointBelongsToBN128Curve(pWxi)
                checkPointBelongsToBN128Curve(pWxiw)

                // Check proof commitments coordinates are in the field
                checkField(calldataload(pA))
                checkField(calldataload(add(pA, 32)))
                checkField(calldataload(pB))
                checkField(calldataload(add(pB, 32)))
                checkField(calldataload(pC))
                checkField(calldataload(add(pC, 32)))
                checkField(calldataload(pZ))
                checkField(calldataload(add(pZ, 32)))
                checkField(calldataload(pT1))
                checkField(calldataload(add(pT1, 32)))
                checkField(calldataload(pT2))
                checkField(calldataload(add(pT2, 32)))
                checkField(calldataload(pT3))
                checkField(calldataload(add(pT3, 32)))
                checkField(calldataload(pWxi))
                checkField(calldataload(add(pWxi, 32)))
                checkField(calldataload(pWxiw))
                checkField(calldataload(add(pWxiw, 32)))

                // Check proof evaluations are in the field
                checkField(calldataload(pEval_a))
                checkField(calldataload(pEval_b))
                checkField(calldataload(pEval_c))
                checkField(calldataload(pEval_s1))
                checkField(calldataload(pEval_s2))
                checkField(calldataload(pEval_zw))
            }
            
            function calculateChallenges(pMem, pPublic) {
                let beta
                let aux

                let mIn := mload(0x40)     // Pointer to the next free memory position

                // Compute challenge.beta & challenge.gamma
                mstore(mIn, Qmx)
                mstore(add(mIn, 32), Qmy)
                mstore(add(mIn, 64), Qlx)
                mstore(add(mIn, 96), Qly)
                mstore(add(mIn, 128), Qrx)
                mstore(add(mIn, 160), Qry)
                mstore(add(mIn, 192), Qox)
                mstore(add(mIn, 224), Qoy)
                mstore(add(mIn, 256), Qcx)
                mstore(add(mIn, 288), Qcy)
                mstore(add(mIn, 320), S1x)
                mstore(add(mIn, 352), S1y)
                mstore(add(mIn, 384), S2x)
                mstore(add(mIn, 416), S2y)
                mstore(add(mIn, 448), S3x)
                mstore(add(mIn, 480), S3y)

                <%for (let i=0; i<nPublic;i++) {%>
                mstore(add(mIn, <%= 512 + i*32 %>), calldataload(add(pPublic, <%=i*32%>)))
                <%}%>
                mstore(add(mIn, <%= 512 + nPublic*32 + 0 %> ), calldataload(pA))
                mstore(add(mIn, <%= 512 + nPublic*32 + 32 %> ), calldataload(add(pA, 32)))
                mstore(add(mIn, <%= 512 + nPublic*32 + 64 %> ), calldataload(pB))
                mstore(add(mIn, <%= 512 + nPublic*32 + 96 %> ), calldataload(add(pB, 32)))
                mstore(add(mIn, <%= 512 + nPublic*32 + 128 %> ), calldataload(pC))
                mstore(add(mIn, <%= 512 + nPublic*32 + 160 %> ), calldataload(add(pC, 32)))
                
                beta := mod(keccak256(mIn, <%= 704 + 32 * nPublic %>), q) 
                mstore(add(pMem, pBeta), beta)

                // challenges.gamma
                mstore(add(pMem, pGamma), mod(keccak256(add(pMem, pBeta), 32), q))
                
                // challenges.alpha
                mstore(mIn, mload(add(pMem, pBeta)))
                mstore(add(mIn, 32), mload(add(pMem, pGamma)))
                mstore(add(mIn, 64), calldataload(pZ))
                mstore(add(mIn, 96), calldataload(add(pZ, 32)))

                aux := mod(keccak256(mIn, 128), q)
                mstore(add(pMem, pAlpha), aux)
                mstore(add(pMem, pAlpha2), mulmod(aux, aux, q))

                // challenges.xi
                mstore(mIn, aux)
                mstore(add(mIn, 32),  calldataload(pT1))
                mstore(add(mIn, 64),  calldataload(add(pT1, 32)))
                mstore(add(mIn, 96),  calldataload(pT2))
                mstore(add(mIn, 128), calldataload(add(pT2, 32)))
                mstore(add(mIn, 160), calldataload(pT3))
                mstore(add(mIn, 192), calldataload(add(pT3, 32)))

                aux := mod(keccak256(mIn, 224), q)
                mstore( add(pMem, pXi), aux)

                // challenges.v
                mstore(mIn, aux)
                mstore(add(mIn, 32),  calldataload(pEval_a))
                mstore(add(mIn, 64),  calldataload(pEval_b))
                mstore(add(mIn, 96),  calldataload(pEval_c))
                mstore(add(mIn, 128), calldataload(pEval_s1))
                mstore(add(mIn, 160), calldataload(pEval_s2))
                mstore(add(mIn, 192), calldataload(pEval_zw))

                let v1 := mod(keccak256(mIn, 224), q)
                mstore(add(pMem, pV1), v1)

                // challenges.beta * challenges.xi
                mstore(add(pMem, pBetaXi), mulmod(beta, aux, q))

                // challenges.xi^n
                <%for (let i=0; i<power;i++) {%>
                aux:= mulmod(aux, aux, q)
                <%}%>
                mstore(add(pMem, pXin), aux)

                // Zh
                aux:= mod(add(sub(aux, 1), q), q)
                mstore(add(pMem, pZh), aux)
                mstore(add(pMem, pZhInv), aux)  // We will invert later together with lagrange pols
                                
                // challenges.v^2, challenges.v^3, challenges.v^4, challenges.v^5
                aux := mulmod(v1, v1,  q)
                mstore(add(pMem, pV2), aux)
                aux := mulmod(aux, v1, q)
                mstore(add(pMem, pV3), aux)
                aux := mulmod(aux, v1, q)
                mstore(add(pMem, pV4), aux)
                aux := mulmod(aux, v1, q)
                mstore(add(pMem, pV5), aux)

                // challenges.u
                mstore(mIn, calldataload(pWxi))
                mstore(add(mIn, 32), calldataload(add(pWxi, 32)))
                mstore(add(mIn, 64), calldataload(pWxiw))
                mstore(add(mIn, 96), calldataload(add(pWxiw, 32)))

                mstore(add(pMem, pU), mod(keccak256(mIn, 128), q))
            }
            
            function calculateLagrange(pMem) {
                let w := 1                
                <% for (let i=1; i<=Math.max(nPublic, 1); i++) { %>
                mstore(
                    add(pMem, pEval_l<%=i%>), 
                    mulmod(
                        n, 
                        mod(
                            add(
                                sub(
                                    mload(add(pMem, pXi)), 
                                    w
                                ), 
                                q
                            ),
                            q
                        ), 
                        q
                    )
                )
                <% if (i<Math.max(nPublic, 1)) { %>
                w := mulmod(w, w1, q)
                <% } %>
                <% } %>
                
                inverseArray(add(pMem, pZhInv), <%=Math.max(nPublic, 1)+1%> )
                
                let zh := mload(add(pMem, pZh))
                w := 1
                <% for (let i=1; i<=Math.max(nPublic, 1); i++) { %>
                <% if (i==1) { %>
                mstore(
                    add(pMem, pEval_l1 ), 
                    mulmod(
                        mload(add(pMem, pEval_l1 )),
                        zh,
                        q
                    )
                )
                <% } else { %>
                mstore(
                    add(pMem, pEval_l<%=i%>), 
                    mulmod(
                        w,
                        mulmod(
                            mload(add(pMem, pEval_l<%=i%>)),
                            zh,
                            q
                        ),
                        q
                    )
                )
                <% } %>
                <% if (i<Math.max(nPublic, 1)) { %>
                w := mulmod(w, w1, q)
                <% } %>
                <% } %>


            }
            
            function calculatePI(pMem, pPub) {
                let pl := 0
                
                <% for (let i=0; i<nPublic; i++) { %> 
                pl := mod(
                    add(
                        sub(
                            pl,  
                            mulmod(
                                mload(add(pMem, pEval_l<%=i+1%>)),
                                calldataload(add(pPub, <%=i*32%>)),
                                q
                            )
                        ),
                        q
                    ),
                    q
                )
                <% } %>
                
                mstore(add(pMem, pPI), pl)
            }

            function calculateR0(pMem) {
                let e1 := mload(add(pMem, pPI))

                let e2 :=  mulmod(mload(add(pMem, pEval_l1)), mload(add(pMem, pAlpha2)), q)

                let e3a := addmod(
                    calldataload(pEval_a),
                    mulmod(mload(add(pMem, pBeta)), calldataload(pEval_s1), q),
                    q)
                e3a := addmod(e3a, mload(add(pMem, pGamma)), q)

                let e3b := addmod(
                    calldataload(pEval_b),
                    mulmod(mload(add(pMem, pBeta)), calldataload(pEval_s2), q),
                    q)
                e3b := addmod(e3b, mload(add(pMem, pGamma)), q)

                let e3c := addmod(
                    calldataload(pEval_c),
                    mload(add(pMem, pGamma)),
                    q)

                let e3 := mulmod(mulmod(e3a, e3b, q), e3c, q)
                e3 := mulmod(e3, calldataload(pEval_zw), q)
                e3 := mulmod(e3, mload(add(pMem, pAlpha)), q)
            
                let r0 := addmod(e1, mod(sub(q, e2), q), q)
                r0 := addmod(r0, mod(sub(q, e3), q), q)
                
                mstore(add(pMem, pEval_r0) , r0)
            }
            
            function g1_set(pR, pP) {
                mstore(pR, mload(pP))
                mstore(add(pR, 32), mload(add(pP,32)))
            }   

            function g1_setC(pR, x, y) {
                mstore(pR, x)
                mstore(add(pR, 32), y)
            }

            function g1_calldataSet(pR, pP) {
                mstore(pR,          calldataload(pP))
                mstore(add(pR, 32), calldataload(add(pP, 32)))
            }

            function g1_acc(pR, pP) {
                let mIn := mload(0x40)
                mstore(mIn, mload(pR))
                mstore(add(mIn,32), mload(add(pR, 32)))
                mstore(add(mIn,64), mload(pP))
                mstore(add(mIn,96), mload(add(pP, 32)))

                let success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)
                
                if iszero(success) {
                    mstore(0, 0)
                    return(0,0x20)
                }
            }

            function g1_mulAcc(pR, pP, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, mload(pP))
                mstore(add(mIn,32), mload(add(pP, 32)))
                mstore(add(mIn,64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)
                
                if iszero(success) {
                    mstore(0, 0)
                    return(0,0x20)
                }
                
                mstore(add(mIn,64), mload(pR))
                mstore(add(mIn,96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)
                
                if iszero(success) {
                    mstore(0, 0)
                    return(0,0x20)
                }
                
            }

            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn,32), y)
                mstore(add(mIn,64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)
                
                if iszero(success) {
                    mstore(0, 0)
                    return(0,0x20)
                }
                
                mstore(add(mIn,64), mload(pR))
                mstore(add(mIn,96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)
                
                if iszero(success) {
                    mstore(0, 0)
                    return(0,0x20)
                }
            }

            function g1_mulSetC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn,32), y)
                mstore(add(mIn,64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, pR, 64)
                
                if iszero(success) {
                    mstore(0, 0)
                    return(0,0x20)
                }
            }

            function g1_mulSet(pR, pP, s) {
                g1_mulSetC(pR, mload(pP), mload(add(pP, 32)), s)
            }

            function calculateD(pMem) {
                let _pD:= add(pMem, pD)
                let gamma := mload(add(pMem, pGamma))
                let mIn := mload(0x40)
                mstore(0x40, add(mIn, 256)) // d1, d2, d3 & d4 (4*64 bytes)

                g1_setC(_pD, Qcx, Qcy)
                g1_mulAccC(_pD, Qmx, Qmy, mulmod(calldataload(pEval_a), calldataload(pEval_b), q))
                g1_mulAccC(_pD, Qlx, Qly, calldataload(pEval_a))
                g1_mulAccC(_pD, Qrx, Qry, calldataload(pEval_b))
                g1_mulAccC(_pD, Qox, Qoy, calldataload(pEval_c))            

                let betaxi := mload(add(pMem, pBetaXi))
                let val1 := addmod(
                    addmod(calldataload(pEval_a), betaxi, q),
                    gamma, q)

                let val2 := addmod(
                    addmod(
                        calldataload(pEval_b),
                        mulmod(betaxi, k1, q),
                        q), gamma, q)

                let val3 := addmod(
                    addmod(
                        calldataload(pEval_c),
                        mulmod(betaxi, k2, q),
                        q), gamma, q)

                let d2a := mulmod(
                    mulmod(mulmod(val1, val2, q), val3, q),
                    mload(add(pMem, pAlpha)),
                    q
                )

                let d2b := mulmod(
                    mload(add(pMem, pEval_l1)),
                    mload(add(pMem, pAlpha2)),
                    q
                )

                // We'll use mIn to save d2
                g1_calldataSet(add(mIn, 192), pZ)
                g1_mulSet(
                    mIn,
                    add(mIn, 192),
                    addmod(addmod(d2a, d2b, q), mload(add(pMem, pU)), q))


                val1 := addmod(
                    addmod(
                        calldataload(pEval_a),
                        mulmod(mload(add(pMem, pBeta)), calldataload(pEval_s1), q),
                        q), gamma, q)

                val2 := addmod(
                    addmod(
                        calldataload(pEval_b),
                        mulmod(mload(add(pMem, pBeta)), calldataload(pEval_s2), q),
                        q), gamma, q)
    
                val3 := mulmod(
                    mulmod(mload(add(pMem, pAlpha)), mload(add(pMem, pBeta)), q),
                    calldataload(pEval_zw), q)
    

                // We'll use mIn + 64 to save d3
                g1_mulSetC(
                    add(mIn, 64),
                    S3x,
                    S3y,
                    mulmod(mulmod(val1, val2, q), val3, q))

                // We'll use mIn + 128 to save d4
                g1_calldataSet(add(mIn, 128), pT1)

                g1_mulAccC(add(mIn, 128), calldataload(pT2), calldataload(add(pT2, 32)), mload(add(pMem, pXin)))
                let xin2 := mulmod(mload(add(pMem, pXin)), mload(add(pMem, pXin)), q)
                g1_mulAccC(add(mIn, 128), calldataload(pT3), calldataload(add(pT3, 32)) , xin2)
                
                g1_mulSetC(add(mIn, 128), mload(add(mIn, 128)), mload(add(mIn, 160)), mload(add(pMem, pZh)))

                mstore(add(add(mIn, 64), 32), mod(sub(qf, mload(add(add(mIn, 64), 32))), qf))
                mstore(add(mIn, 160), mod(sub(qf, mload(add(mIn, 160))), qf))
                g1_acc(_pD, mIn)
                g1_acc(_pD, add(mIn, 64))
                g1_acc(_pD, add(mIn, 128))
            }
            
            function calculateF(pMem) {
                let p := add(pMem, pF)

                g1_set(p, add(pMem, pD))
                g1_mulAccC(p, calldataload(pA), calldataload(add(pA, 32)), mload(add(pMem, pV1)))
                g1_mulAccC(p, calldataload(pB), calldataload(add(pB, 32)), mload(add(pMem, pV2)))
                g1_mulAccC(p, calldataload(pC), calldataload(add(pC, 32)), mload(add(pMem, pV3)))
                g1_mulAccC(p, S1x, S1y, mload(add(pMem, pV4)))
                g1_mulAccC(p, S2x, S2y, mload(add(pMem, pV5)))
            }
            
            function calculateE(pMem) {
                let s := mod(sub(q, mload(add(pMem, pEval_r0))), q)

                s := addmod(s, mulmod(calldataload(pEval_a),  mload(add(pMem, pV1)), q), q)
                s := addmod(s, mulmod(calldataload(pEval_b),  mload(add(pMem, pV2)), q), q)
                s := addmod(s, mulmod(calldataload(pEval_c),  mload(add(pMem, pV3)), q), q)
                s := addmod(s, mulmod(calldataload(pEval_s1), mload(add(pMem, pV4)), q), q)
                s := addmod(s, mulmod(calldataload(pEval_s2), mload(add(pMem, pV5)), q), q)
                s := addmod(s, mulmod(calldataload(pEval_zw), mload(add(pMem, pU)),  q), q)

                g1_mulSetC(add(pMem, pE), G1x, G1y, s)
            }
            
            function checkPairing(pMem) -> isOk {
                let mIn := mload(0x40)
                mstore(0x40, add(mIn, 576)) // [0..383] = pairing data, [384..447] = pWxi, [448..512] = pWxiw

                let _pWxi := add(mIn, 384)
                let _pWxiw := add(mIn, 448)
                let _aux := add(mIn, 512)

                g1_calldataSet(_pWxi, pWxi)
                g1_calldataSet(_pWxiw, pWxiw)

                // A1
                g1_mulSet(mIn, _pWxiw, mload(add(pMem, pU)))
                g1_acc(mIn, _pWxi)
                mstore(add(mIn, 32), mod(sub(qf, mload(add(mIn, 32))), qf))

                // [X]_2
                mstore(add(mIn,64), X2x2)
                mstore(add(mIn,96), X2x1)
                mstore(add(mIn,128), X2y2)
                mstore(add(mIn,160), X2y1)

                // B1
                g1_mulSet(add(mIn, 192), _pWxi, mload(add(pMem, pXi)))

                let s := mulmod(mload(add(pMem, pU)), mload(add(pMem, pXi)), q)
                s := mulmod(s, w1, q)
                g1_mulSet(_aux, _pWxiw, s)
                g1_acc(add(mIn, 192), _aux)
                g1_acc(add(mIn, 192), add(pMem, pF))
                mstore(add(pMem, add(pE, 32)), mod(sub(qf, mload(add(pMem, add(pE, 32)))), qf))
                g1_acc(add(mIn, 192), add(pMem, pE))

                // [1]_2
                mstore(add(mIn,256), G2x2)
                mstore(add(mIn,288), G2x1)
                mstore(add(mIn,320), G2y2)
                mstore(add(mIn,352), G2y1)
                
                let success := staticcall(sub(gas(), 2000), 8, mIn, 384, mIn, 0x20)
                
                isOk := and(success, mload(mIn))
            }
            
            let pMem := mload(0x40)
            mstore(0x40, add(pMem, lastMem))
            
            checkProofData()
            calculateChallenges(pMem, _pubSignals)
            calculateLagrange(pMem)
            calculatePI(pMem, _pubSignals)
            calculateR0(pMem)
            calculateD(pMem)
            calculateF(pMem)
            calculateE(pMem)
            let isValid := checkPairing(pMem)
   
            mstore(0x40, sub(pMem, lastMem))
            mstore(0, isValid)
            return(0,0x20)
        }
        
    }
}
`;

export const FFLONK_VERIFIER_TEMPLATE = `// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract FflonkVerifier {
    uint32 constant n     = <%= 2**power %>; // Domain size

    // Verification Key data
    uint256 constant k1   = <%= k1 %>;   // Plonk k1 multiplicative factor to force distinct cosets of H
    uint256 constant k2   = <%= k2 %>;   // Plonk k2 multiplicative factor to force distinct cosets of H

    // OMEGAS
    // Omega, Omega^{1/3}
    uint256 constant w1   = <%= w  %>;
    uint256 constant wr   = <%= wr %>;
    // Omega_3, Omega_3^2
    uint256 constant w3   = <%= w3 %>;
    uint256 constant w3_2 = <%= w3_2 %>;
    // Omega_4, Omega_4^2, Omega_4^3
    uint256 constant w4   = <%= w4 %>;
    uint256 constant w4_2 = <%= w4_2 %>;
    uint256 constant w4_3 = <%= w4_3 %>;
    // Omega_8, Omega_8^2, Omega_8^3, Omega_8^4, Omega_8^5, Omega_8^6, Omega_8^7
    uint256 constant w8_1 = <%= w8 %>;
    uint256 constant w8_2 = <%= w8_2 %>;
    uint256 constant w8_3 = <%= w8_3 %>;
    uint256 constant w8_4 = <%= w8_4 %>;
    uint256 constant w8_5 = <%= w8_5 %>;
    uint256 constant w8_6 = <%= w8_6 %>;
    uint256 constant w8_7 = <%= w8_7 %>;

    // Verifier preprocessed input C_0(x)·[1]_1
    uint256 constant C0x  = <%= C0[0] %>;
    uint256 constant C0y  = <%= C0[1] %>;

    // Verifier preprocessed input x·[1]_2
    uint256 constant X2x1 = <%= X_2[0][0] %>;
    uint256 constant X2x2 = <%= X_2[0][1] %>;
    uint256 constant X2y1 = <%= X_2[1][0] %>;
    uint256 constant X2y2 = <%= X_2[1][1] %>;

    // Scalar field size
    uint256 constant q    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant qf   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    // [1]_1
    uint256 constant G1x  = 1;
    uint256 constant G1y  = 2;
    // [1]_2
    uint256 constant G2x1 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant G2x2 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant G2y1 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant G2y2 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;

    // Proof calldata
    // Byte offset of every parameter of the calldata
    // Polynomial commitments
    uint16 constant pC1       = 4 + 0;     // [C1]_1
    uint16 constant pC2       = 4 + 32*2;  // [C2]_1
    uint16 constant pW1       = 4 + 32*4;  // [W]_1
    uint16 constant pW2       = 4 + 32*6;  // [W']_1
    // Opening evaluations
    uint16 constant pEval_ql  = 4 + 32*8;  // q_L(xi)
    uint16 constant pEval_qr  = 4 + 32*9;  // q_R(xi)
    uint16 constant pEval_qm  = 4 + 32*10; // q_M(xi)
    uint16 constant pEval_qo  = 4 + 32*11; // q_O(xi)
    uint16 constant pEval_qc  = 4 + 32*12; // q_C(xi)
    uint16 constant pEval_s1  = 4 + 32*13; // S_{sigma_1}(xi)
    uint16 constant pEval_s2  = 4 + 32*14; // S_{sigma_2}(xi)
    uint16 constant pEval_s3  = 4 + 32*15; // S_{sigma_3}(xi)
    uint16 constant pEval_a   = 4 + 32*16; // a(xi)
    uint16 constant pEval_b   = 4 + 32*17; // b(xi)
    uint16 constant pEval_c   = 4 + 32*18; // c(xi)
    uint16 constant pEval_z   = 4 + 32*19; // z(xi)
    uint16 constant pEval_zw  = 4 + 32*20; // z_omega(xi)
    uint16 constant pEval_t1w = 4 + 32*21; // T_1(xi omega)
    uint16 constant pEval_t2w = 4 + 32*22; // T_2(xi omega)
    uint16 constant pEval_inv = 4 + 32*23; // inv(batch) sent by the prover to avoid any inverse calculation to save gas,
                                           // we check the correctness of the inv(batch) by computing batch
                                           // and checking inv(batch) * batch == 1

    // Memory data
    // Challenges
    uint16 constant pAlpha   = 0;   // alpha challenge
    uint16 constant pBeta    = 32;  // beta challenge
    uint16 constant pGamma   = 64;  // gamma challenge
    uint16 constant pY       = 96;  // y challenge
    uint16 constant pXiSeed  = 128; // xi seed, from this value we compute xi = xiSeed^24
    uint16 constant pXiSeed2 = 160; // (xi seed)^2
    uint16 constant pXi      = 192; // xi challenge

    // Roots
    // S_0 = roots_8(xi) = { h_0, h_0w_8, h_0w_8^2, h_0w_8^3, h_0w_8^4, h_0w_8^5, h_0w_8^6, h_0w_8^7 }
    uint16 constant pH0w8_0 = 224;
    uint16 constant pH0w8_1 = <%= 224 + 32 %>;
    uint16 constant pH0w8_2 = <%= 224 + 32 * 2 %>;
    uint16 constant pH0w8_3 = <%= 224 + 32 * 3 %>;
    uint16 constant pH0w8_4 = <%= 224 + 32 * 4 %>;
    uint16 constant pH0w8_5 = <%= 224 + 32 * 5 %>;
    uint16 constant pH0w8_6 = <%= 224 + 32 * 6 %>;
    uint16 constant pH0w8_7 = <%= 224 + 32 * 7 %>;

    // S_1 = roots_4(xi) = { h_1, h_1w_4, h_1w_4^2, h_1w_4^3 }
    uint16 constant pH1w4_0 = <%= 224 + 32 * 8 %>;
    uint16 constant pH1w4_1 = <%= 224 + 32 * 9 %>;
    uint16 constant pH1w4_2 = <%= 224 + 32 * 10 %>;
    uint16 constant pH1w4_3 = <%= 224 + 32 * 11 %>;

    // S_2 = roots_3(xi) U roots_3(xi omega)
    // roots_3(xi) = { h_2, h_2w_3, h_2w_3^2 }
    uint16 constant pH2w3_0 = <%= 224 + 32 * 12 %>;
    uint16 constant pH2w3_1 = <%= 224 + 32 * 13 %>;
    uint16 constant pH2w3_2 = <%= 224 + 32 * 14 %>;
    // roots_3(xi omega) = { h_3, h_3w_3, h_3w_3^2 }
    uint16 constant pH3w3_0 = <%= 224 + 32 * 15 %>;
    uint16 constant pH3w3_1 = <%= 224 + 32 * 16 %>;
    uint16 constant pH3w3_2 = <%= 224 + 32 * 17 %>;

    uint16 constant pPi     = <%= 224 + 32 * 18 %>; // PI(xi)
    uint16 constant pR0     = <%= 224 + 32 * 19 %>; // r0(y)
    uint16 constant pR1     = <%= 224 + 32 * 20 %>; // r1(y)
    uint16 constant pR2     = <%= 224 + 32 * 21 %>; // r2(y)

    uint16 constant pF      = <%= 224 + 32 * 22 %>;  // [F]_1, 64 bytes
    uint16 constant pE      = <%= 224 + 32 * 22 + 64 %>;  // [E]_1, 64 bytes
    uint16 constant pJ      = <%= 224 + 32 * 22 + 64 * 2 %>; // [J]_1, 64 bytes

    uint16 constant pZh     = <%= 224 + 32 * 22 + 64 * 4 %>; // Z_H(xi)
    // From this point we write all the variables that must be computed using the Montgomery batch inversion
    uint16 constant pZhInv  = <%= 224 + 32 * 23 + 64 * 4 %>; // 1/Z_H(xi)
    uint16 constant pDenH1  = <%= 224 + 32 * 24 + 64 * 4 %>; // 1/( (y-h_1w_4) (y-h_1w_4^2) (y-h_1w_4^3) (y-h_1w_4^4) )
    uint16 constant pDenH2  = <%= 224 + 32 * 25 + 64 * 4 %>; // 1/( (y-h_2w_3) (y-h_2w_3^2) (y-h_2w_3^3) (y-h_3w_3) (y-h_3w_3^2) (y-h_3w_3^3) )
    uint16 constant pLiS0Inv = <%= 224 + 32 * 26 + 64 * 4 %>; // Reserve 8 * 32 bytes to compute r_0(X)
    uint16 constant pLiS1Inv = <%= 224 + 32 * 34 + 64 * 4 %>; // Reserve 4 * 32 bytes to compute r_1(X)
    uint16 constant pLiS2Inv = <%= 224 + 32 * 38 + 64 * 4 %>; // Reserve 6 * 32 bytes to compute r_2(X)
    // Lagrange evaluations
    <% for (let i = 1; i <= Math.max(nPublic, 1); i++) { %>
    uint16 constant pEval_l<%=i%> = <%= 224 + 32 * (43 + i) + 64 * 4 %>;
    <% } %>
    <% let pLastMem = 224 + 32 * (44 + Math.max(nPublic,1)) + 64 * 4 %>
    uint16 constant lastMem = <%= pLastMem %>;
     
<% const inversionArray = ["pZhInv", "pDenH1", "pDenH2", "pLiS0Inv", "add(pLiS0Inv, 32)", "add(pLiS0Inv, 64)", "add(pLiS0Inv, 96)",
    "add(pLiS0Inv, 128)", "add(pLiS0Inv, 160)", "add(pLiS0Inv, 192)", "add(pLiS0Inv, 224)", "pLiS1Inv", "add(pLiS1Inv, 32)", 
    "add(pLiS1Inv, 64)", "add(pLiS1Inv, 96)", "pLiS2Inv", "add(pLiS2Inv, 32)", "add(pLiS2Inv, 64)", "add(pLiS2Inv, 96)",
    "add(pLiS2Inv, 128)", "add(pLiS2Inv, 160)"] -%>
<% for (let i=1; i<=Math.max(nPublic, 1); i++) { -%>
<%      inversionArray.push(\`pEval_l\${i}\`); -%>
<% } -%>

    function verifyProof(bytes32[24] calldata proof, uint256[<%- Math.max(nPublic, 1) %>] calldata pubSignals) public view returns (bool) {
        assembly {
            // Computes the inverse of an array of values
            // See https://vitalik.ca/general/2018/07/21/starks_part_3.html in section where explain fields operations
            // To save the inverse to be computed on chain the prover sends the inverse as an evaluation in commits.eval_inv
            function inverseArray(pMem) {

                let pAux := mload(0x40)     // Point to the next free position
                let acc := mload(add(pMem,<%- inversionArray[0] %>))       // Read the first element
                mstore(pAux, acc)

<%  for(let i = 1; i < inversionArray.length; ++i) { -%>
                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, <%- inversionArray[i] %>)), q)
                mstore(pAux, acc)

<% } -%>

                let inv := calldataload(pEval_inv)

                // Before using the inverse sent by the prover the verifier checks inv(batch) * batch === 1
                if iszero(eq(1, mulmod(acc, inv, q))) {
                    mstore(0, 0)
                    return(0,0x20)
                }

                acc := inv

<%  for(let i = inversionArray.length - 1; i > 0; --i) { -%>
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, <%- inversionArray[i] %>)), q)
                mstore(add(pMem, <%- inversionArray[i] %>), inv)
<% } -%>

                mstore(add(pMem, <%- inversionArray[0] %>), acc)
            }

            function checkField(v) {
                if iszero(lt(v, q)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPointBelongsToBN128Curve(p) {
                let x := calldataload(p)
                let y := calldataload(add(p, 32))

                // Check that the point is on the curve
                // y^2 = x^3 + 3
                let x3_3 := addmod(mulmod(x, mulmod(x, x, qf), qf), 3, qf)
                let y2 := mulmod(y, y, qf)

                if iszero(eq(x3_3, y2)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }  
            
            function checkProofData() {
                // Check proof commitments belong to the bn128 curve
                checkPointBelongsToBN128Curve(pC1)
                checkPointBelongsToBN128Curve(pC2)
                checkPointBelongsToBN128Curve(pW1)
                checkPointBelongsToBN128Curve(pW2)

                // Check proof commitments coordinates are in the field
                checkField(calldataload(pC1))
                checkField(calldataload(add(pC1, 32)))
                checkField(calldataload(pC2))
                checkField(calldataload(add(pC2, 32)))
                checkField(calldataload(pW1))
                checkField(calldataload(add(pW1, 32)))
                checkField(calldataload(pW2))
                checkField(calldataload(add(pW2, 32)))

                // Check proof evaluations are in the field
                checkField(calldataload(pEval_ql))
                checkField(calldataload(pEval_qr))
                checkField(calldataload(pEval_qm))
                checkField(calldataload(pEval_qo))
                checkField(calldataload(pEval_qc))
                checkField(calldataload(pEval_s1))
                checkField(calldataload(pEval_s2))
                checkField(calldataload(pEval_s3))
                checkField(calldataload(pEval_a))
                checkField(calldataload(pEval_b))
                checkField(calldataload(pEval_c))
                checkField(calldataload(pEval_z))
                checkField(calldataload(pEval_zw))
                checkField(calldataload(pEval_t1w))
                checkField(calldataload(pEval_t2w))
                checkField(calldataload(pEval_inv))
            }

            function computeChallenges(pMem, pPublic) {
                // Compute challenge.beta & challenge.gamma
                mstore(add(pMem, <%= pLastMem %> ), C0x)
                mstore(add(pMem, <%= pLastMem + 32 %> ), C0y)

                mstore(add(pMem, <%= pLastMem + 64 %>), calldataload(pPublic))
                <%for (let i=1; i<nPublic;i++) { %>
                mstore(add(pMem, <%= pLastMem + 64 + i * 32 %> ), calldataload(add(pPublic, <%= i * 32 %>)))
                <%}%>
                

                mstore(add(pMem, <%= pLastMem + nPublic * 32 + 64 %> ),  calldataload(pC1))
                mstore(add(pMem, <%= pLastMem + nPublic * 32 + 96 %> ),  calldataload(add(pC1, 32)))

                mstore(add(pMem, pBeta),  mod(keccak256(add(pMem, lastMem), <%= nPublic * 32 + 128 %>), q))
                mstore(add(pMem, pGamma), mod(keccak256(add(pMem, pBeta), 32), q))

                // Get xiSeed & xiSeed2
                mstore(add(pMem, lastMem), mload(add(pMem, pGamma)))
                mstore(add(pMem, <%= pLastMem + 32 %>), calldataload(pC2))
                mstore(add(pMem, <%= pLastMem + 64 %>), calldataload(add(pC2, 32)))
                let xiSeed := mod(keccak256(add(pMem, lastMem), 96), q)

                mstore(add(pMem, pXiSeed), xiSeed)
                mstore(add(pMem, pXiSeed2), mulmod(xiSeed, xiSeed, q))

                // Compute roots.S0.h0w8
                mstore(add(pMem, pH0w8_0), mulmod(mload(add(pMem, pXiSeed2)), mload(add(pMem, pXiSeed)), q))
                mstore(add(pMem, pH0w8_1), mulmod(mload(add(pMem, pH0w8_0)), w8_1, q))
                mstore(add(pMem, pH0w8_2), mulmod(mload(add(pMem, pH0w8_0)), w8_2, q))
                mstore(add(pMem, pH0w8_3), mulmod(mload(add(pMem, pH0w8_0)), w8_3, q))
                mstore(add(pMem, pH0w8_4), mulmod(mload(add(pMem, pH0w8_0)), w8_4, q))
                mstore(add(pMem, pH0w8_5), mulmod(mload(add(pMem, pH0w8_0)), w8_5, q))
                mstore(add(pMem, pH0w8_6), mulmod(mload(add(pMem, pH0w8_0)), w8_6, q))
                mstore(add(pMem, pH0w8_7), mulmod(mload(add(pMem, pH0w8_0)), w8_7, q))

                // Compute roots.S1.h1w4
                mstore(add(pMem, pH1w4_0), mulmod(mload(add(pMem, pH0w8_0)), mload(add(pMem, pH0w8_0)), q))
                mstore(add(pMem, pH1w4_1), mulmod(mload(add(pMem, pH1w4_0)), w4, q))
                mstore(add(pMem, pH1w4_2), mulmod(mload(add(pMem, pH1w4_0)), w4_2, q))
                mstore(add(pMem, pH1w4_3), mulmod(mload(add(pMem, pH1w4_0)), w4_3, q))

                // Compute roots.S2.h2w3
                mstore(add(pMem, pH2w3_0), mulmod(mload(add(pMem, pH1w4_0)), mload(add(pMem, pXiSeed2)), q))
                mstore(add(pMem, pH2w3_1), mulmod(mload(add(pMem, pH2w3_0)), w3, q))
                mstore(add(pMem, pH2w3_2), mulmod(mload(add(pMem, pH2w3_0)), w3_2, q))

                // Compute roots.S2.h2w3
                mstore(add(pMem, pH3w3_0), mulmod(mload(add(pMem, pH2w3_0)), wr, q))
                mstore(add(pMem, pH3w3_1), mulmod(mload(add(pMem, pH3w3_0)), w3, q))
                mstore(add(pMem, pH3w3_2), mulmod(mload(add(pMem, pH3w3_0)), w3_2, q))

                let xin := mulmod(mulmod(mload(add(pMem, pH2w3_0)), mload(add(pMem, pH2w3_0)), q), mload(add(pMem, pH2w3_0)), q)
                mstore(add(pMem, pXi), xin)

                // Compute xi^n
                <%for ( let i = 0; i < power; i++) { %>
                xin:= mulmod(xin, xin, q)
                <%}%>
                
                xin:= mod(add(sub(xin, 1), q), q)
                mstore(add(pMem, pZh), xin)
                mstore(add(pMem, pZhInv), xin)  // We will invert later together with lagrange pols

                // Compute challenge.alpha
                mstore(add(pMem, lastMem), xiSeed)

                calldatacopy(add(pMem, <%= pLastMem + 32 %>), pEval_ql, 480)
                mstore(add(pMem, pAlpha), mod(keccak256(add(pMem, lastMem), 512), q))

                // Compute challenge.y
                mstore(add(pMem, lastMem), mload(add(pMem, pAlpha)))
                mstore(add(pMem, <%= pLastMem + 32 %> ),  calldataload(pW1))
                mstore(add(pMem, <%= pLastMem + 64 %> ),  calldataload(add(pW1, 32)))
                mstore(add(pMem, pY), mod(keccak256(add(pMem, lastMem), 96), q))
            }

            function computeLiS0(pMem) {
                let root0 := mload(add(pMem, pH0w8_0))
                let y := mload(add(pMem, pY))
                let den1 := 1
                den1 := mulmod(den1, root0, q)
                den1 := mulmod(den1, root0, q)
                den1 := mulmod(den1, root0, q)
                den1 := mulmod(den1, root0, q)
                den1 := mulmod(den1, root0, q)
                den1 := mulmod(den1, root0, q)
                
                den1 := mulmod(8, den1, q)

                let den2 := mload(add(pMem, add(pH0w8_0, mul(mod(mul(7, 0), 8), 32))))
                let den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(0, 32))))), q), q)

                mstore(add(pMem, add(pLiS0Inv, 0)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH0w8_0, mul(mod(mul(7, 1), 8), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(1, 32))))), q), q)

                mstore(add(pMem, add(pLiS0Inv, 32)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH0w8_0, mul(mod(mul(7, 2), 8), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(2, 32))))), q), q)

                mstore(add(pMem, add(pLiS0Inv, 64)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH0w8_0, mul(mod(mul(7, 3), 8), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(3, 32))))), q), q)

                mstore(add(pMem, add(pLiS0Inv, 96)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH0w8_0, mul(mod(mul(7, 4), 8), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(4, 32))))), q), q)

                mstore(add(pMem, add(pLiS0Inv, 128)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH0w8_0, mul(mod(mul(7, 5), 8), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(5, 32))))), q), q)

                mstore(add(pMem, add(pLiS0Inv, 160)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH0w8_0, mul(mod(mul(7, 6), 8), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(6, 32))))), q), q)

                mstore(add(pMem, add(pLiS0Inv, 192)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH0w8_0, mul(mod(mul(7, 7), 8), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(7, 32))))), q), q)

                mstore(add(pMem, add(pLiS0Inv, 224)), mulmod(den1, mulmod(den2, den3, q), q))
            
            }

            function computeLiS1(pMem) {
                let root0 := mload(add(pMem, pH1w4_0))
                let y := mload(add(pMem, pY))
                let den1 := 1
                den1 := mulmod(den1, root0, q)
                den1 := mulmod(den1, root0, q)
                
                den1 := mulmod(4, den1, q)

                let den2 := mload(add(pMem, add(pH1w4_0, mul(mod(mul(3, 0), 4), 32))))
                let den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH1w4_0, mul(0, 32))))), q), q)

                mstore(add(pMem, add(pLiS1Inv, 0)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH1w4_0, mul(mod(mul(3, 1), 4), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH1w4_0, mul(1, 32))))), q), q)

                mstore(add(pMem, add(pLiS1Inv, 32)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH1w4_0, mul(mod(mul(3, 2), 4), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH1w4_0, mul(2, 32))))), q), q)

                mstore(add(pMem, add(pLiS1Inv, 64)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH1w4_0, mul(mod(mul(3, 3), 4), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH1w4_0, mul(3, 32))))), q), q)

                mstore(add(pMem, add(pLiS1Inv, 96)), mulmod(den1, mulmod(den2, den3, q), q))            
            }

            function computeLiS2(pMem) {

                let y := mload(add(pMem, pY))

                let den1 := mulmod(mulmod(3,mload(add(pMem, pH2w3_0)),q), addmod(mload(add(pMem, pXi)) ,mod(sub(q, mulmod(mload(add(pMem, pXi)), w1 ,q)), q), q), q)

                let den2 := mload(add(pMem, add(pH2w3_0, mul(mod(mul(2, 0), 3), 32))))
                let den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH2w3_0, mul(0, 32))))), q), q)

                mstore(add(pMem, add(pLiS2Inv, 0)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH2w3_0, mul(mod(mul(2, 1), 3), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH2w3_0, mul(1, 32))))), q), q)

                mstore(add(pMem, add(pLiS2Inv, 32)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH2w3_0, mul(mod(mul(2, 2), 3), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH2w3_0, mul(2, 32))))), q), q)

                mstore(add(pMem, add(pLiS2Inv, 64)), mulmod(den1, mulmod(den2, den3, q), q))

                den1 := mulmod(mulmod(3,mload(add(pMem, pH3w3_0)),q), addmod(mulmod(mload(add(pMem, pXi)), w1 ,q),mod(sub(q, mload(add(pMem, pXi))), q), q), q)

                den2 := mload(add(pMem, add(pH3w3_0, mul(mod(mul(2, 0), 3), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH3w3_0, mul(0, 32))))), q), q)

                mstore(add(pMem, add(pLiS2Inv, 96)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH3w3_0, mul(mod(mul(2, 1), 3), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH3w3_0, mul(1, 32))))), q), q)

                mstore(add(pMem, add(pLiS2Inv, 128)), mulmod(den1, mulmod(den2, den3, q), q))

                den2 := mload(add(pMem, add(pH3w3_0, mul(mod(mul(2, 2), 3), 32))))
                den3 := addmod(y, mod(sub(q, mload(add(pMem, add(pH3w3_0, mul(2, 32))))), q), q)

                mstore(add(pMem, add(pLiS2Inv, 160)), mulmod(den1, mulmod(den2, den3, q), q))
            }

            // Prepare all the denominators that must be inverted, placed them in consecutive memory addresses
            function computeInversions(pMem) {
                // 1/ZH(xi) used in steps 8 and 9 of the verifier to multiply by 1/Z_H(xi)
                // Value computed during computeChallenges function and stores in pMem+pZhInv

                // 1/((y - h1) (y - h1w4) (y - h1w4_2) (y - h1w4_3))
                // used in steps 10 and 11 of the verifier
                let y := mload(add(pMem, pY))
                let w := addmod(y, mod(sub(q, mload(add(pMem, pH1w4_0))), q), q)
                w := mulmod(w, addmod(y, mod(sub(q, mload(add(pMem, pH1w4_1))), q), q), q)
                w := mulmod(w, addmod(y, mod(sub(q, mload(add(pMem, pH1w4_2))), q), q), q)
                w := mulmod(w, addmod(y, mod(sub(q, mload(add(pMem, pH1w4_3))), q), q), q)
                mstore(add(pMem, pDenH1), w)

                // 1/((y - h2) (y - h2w3) (y - h2w3_2) (y - h3) (y - h3w3) (y - h3w3_2))
                w := addmod(y, mod(sub(q, mload(add(pMem, pH2w3_0))), q), q)
                w := mulmod(w, addmod(y, mod(sub(q, mload(add(pMem, pH2w3_1))), q), q), q)
                w := mulmod(w, addmod(y, mod(sub(q, mload(add(pMem, pH2w3_2))), q), q), q)
                w := mulmod(w, addmod(y, mod(sub(q, mload(add(pMem, pH3w3_0))), q), q), q)
                w := mulmod(w, addmod(y, mod(sub(q, mload(add(pMem, pH3w3_1))), q), q), q)
                w := mulmod(w, addmod(y, mod(sub(q, mload(add(pMem, pH3w3_2))), q), q), q)
                mstore(add(pMem, pDenH2), w)

                // Denominator needed in the verifier when computing L_i^{S0}(X)
                computeLiS0(pMem)
                
                // Denominator needed in the verifier when computing L_i^{S1}(X)
                computeLiS1(pMem)

                // Denominator needed in the verifier when computing L_i^{S2}(X)
                computeLiS2(pMem)

                // L_i where i from 1 to num public inputs, needed in step 6 and 7 of the verifier to compute L_1(xi) and PI(xi)
                w := 1
                let xi := mload(add(pMem, pXi))
                <% for (let i=1; i<=Math.max(nPublic, 1); i++) { %>
                mstore(add(pMem, pEval_l<%=i%>), mulmod(n, mod(add(sub(xi, w), q), q), q))
                <% if (i<Math.max(nPublic, 1)) { %>
                w := mulmod(w, w1, q)
                <% } 
                } %>

                // Execute Montgomery batched inversions of the previous prepared values
                inverseArray(pMem)            }

            // Compute Lagrange polynomial evaluation L_i(xi)
            function computeLagrange(pMem) {
                let zh := mload(add(pMem, pZh))
                let w := 1
                <% for (let i=1; i<=Math.max(nPublic, 1); i++) { 
                    if (i===1) { %>
                    mstore(add(pMem, pEval_l1 ), mulmod(mload(add(pMem, pEval_l1 )), zh, q))
                    <% } else { %>
                    mstore(add(pMem, pEval_l<%=i%>), mulmod(w, mulmod(mload(add(pMem, pEval_l<%=i%>)), zh, q), q))
                    <% } 
                    if (i<Math.max(nPublic, 1)) { %>
                    w := mulmod(w, w1, q)
                    <% } 
                } %>
            }

            // Compute public input polynomial evaluation PI(xi)
            function computePi(pMem, pPub) {
                let pi := 0
                pi := mod(add(sub(pi, mulmod(mload(add(pMem, pEval_l1)), calldataload(pPub), q)), q), q)
                <% for (let i=1; i<nPublic; i++) { %>
                pi := mod(add(sub(pi, mulmod(mload(add(pMem, pEval_l<%= i + 1 %>)), calldataload(add(pPub, <%= 32 * i %>)), q)), q), q)
                <% } %>
                mstore(add(pMem, pPi), pi)
            }

            // Compute r0(y) by interpolating the polynomial r0(X) using 8 points (x,y)
            // where x = {h9, h0w8, h0w8^2, h0w8^3, h0w8^4, h0w8^5, h0w8^6, h0w8^7}
            // and   y = {C0(h0), C0(h0w8), C0(h0w8^2), C0(h0w8^3), C0(h0w8^4), C0(h0w8^5), C0(h0w8^6), C0(h0w8^7)}
            // and computing C0(xi)
            function computeR0(pMem) {
                let num := 1
                let y := mload(add(pMem, pY))
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)

                num := addmod(num, mod(sub(q, mload(add(pMem, pXi))), q), q)

                let res
                let h0w80
                let c0Value
                let h0w8i
<% for(let i = 0; i < 8; ++i) {  -%>
                    
                // Compute c0Value = ql + (h0w8i) qr + (h0w8i)^2 qo + (h0w8i)^3 qm + (h0w8i)^4 qc +
                //                      + (h0w8i)^5 S1 + (h0w8i)^6 S2 + (h0w8i)^7 S3
                h0w80 := mload(add(pMem, pH0w8_<%- i %>))
                c0Value := addmod(calldataload(pEval_ql), mulmod(calldataload(pEval_qr), h0w80, q), q)
                h0w8i := mulmod(h0w80, h0w80, q)
                c0Value := addmod(c0Value, mulmod(calldataload(pEval_qo), h0w8i, q), q)
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(c0Value, mulmod(calldataload(pEval_qm), h0w8i, q), q)
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(c0Value, mulmod(calldataload(pEval_qc), h0w8i, q), q)
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(c0Value, mulmod(calldataload(pEval_s1), h0w8i, q), q)
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(c0Value, mulmod(calldataload(pEval_s2), h0w8i, q), q)
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(c0Value, mulmod(calldataload(pEval_s3), h0w8i, q), q)

                res := addmod(res, mulmod(c0Value, mulmod(num, mload(add(pMem, add(pLiS0Inv, <%- i * 32 %>))), q), q), q)

<%  } -%>

                mstore(add(pMem, pR0), res)
            }

            // Compute r1(y) by interpolating the polynomial r1(X) using 4 points (x,y)
            // where x = {h1, h1w4, h1w4^2, h1w4^3}
            // and   y = {C1(h1), C1(h1w4), C1(h1w4^2), C1(h1w4^3)}
            // and computing T0(xi)
            function computeR1(pMem) {
                let num := 1
                let y := mload(add(pMem, pY))
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)

                num := addmod(num, mod(sub(q, mload(add(pMem, pXi))), q), q)

                let t0
                let evalA := calldataload(pEval_a)
                let evalB := calldataload(pEval_b)
                let evalC := calldataload(pEval_c)

                t0 := mulmod(calldataload(pEval_ql), evalA, q)
                t0 := addmod(t0, mulmod(calldataload(pEval_qr), evalB, q) ,q)
                t0 := addmod(t0, mulmod(calldataload(pEval_qm), mulmod(evalA, evalB, q), q) ,q)
                t0 := addmod(t0, mulmod(calldataload(pEval_qo), evalC, q) ,q)
                t0 := addmod(t0, calldataload(pEval_qc) ,q)
                t0 := addmod(t0, mload(add(pMem, pPi)), q)
                t0 := mulmod(t0, mload(add(pMem, pZhInv)), q)

                let res
                let c1Value
                let h1w4
                let square
<% for(let i = 0; i < 4; ++i) {  -%>
                c1Value := evalA
                h1w4 := mload(add(pMem, pH1w4_<%-i%>))

                c1Value := addmod(c1Value, mulmod(h1w4, evalB, q), q)
                square := mulmod(h1w4, h1w4, q)
                c1Value := addmod(c1Value, mulmod(square, evalC, q), q)
                c1Value := addmod(c1Value, mulmod(mulmod(square, h1w4, q), t0, q), q)

                res := addmod(res, mulmod(c1Value, mulmod(num, mload(add(pMem, add(pLiS1Inv, mul(<%- i %>, 32)))), q), q), q)

<%  } -%>

                mstore(add(pMem, pR1), res)
            }

            // Compute r2(y) by interpolating the polynomial r2(X) using 6 points (x,y)
            // where x = {[h2, h2w3, h2w3^2], [h3, h3w3, h3w3^2]}
            // and   y = {[C2(h2), C2(h2w3), C2(h2w3^2)], [C2(h3), C2(h3w3), C2(h3w3^2)]}
            // and computing T1(xi) and T2(xi)
            function computeR2(pMem) {
                let y := mload(add(pMem, pY))
                let num := 1
                num := mulmod(y, num, q)
                num := mulmod(y, num, q)
                num := mulmod(y, num, q)
                num := mulmod(y, num, q)
                num := mulmod(y, num, q)
                num := mulmod(y, num, q)

                let num2 := 1
                num2 := mulmod(y, num2, q)
                num2 := mulmod(y, num2, q)
                num2 := mulmod(y, num2, q)
                num2 := mulmod(num2, addmod(mulmod(mload(add(pMem, pXi)), w1 ,q), mload(add(pMem, pXi)), q), q)

                num := addmod(num, mod(sub(q, num2), q), q)

                num2 := mulmod(mulmod(mload(add(pMem, pXi)), w1 ,q), mload(add(pMem, pXi)), q)

                num := addmod(num, num2, q)

                let t1
                let t2
                let betaXi := mulmod(mload(add(pMem, pBeta)), mload(add(pMem, pXi)), q)
                let gamma := mload(add(pMem, pGamma))

                t2 := addmod(calldataload( pEval_a), addmod(betaXi, gamma, q) ,q)
                t2 := mulmod(t2,
                            addmod(calldataload( pEval_b),
                            addmod(mulmod(betaXi, k1, q), gamma, q) ,q), q)
                t2 := mulmod(t2,
                            addmod(calldataload( pEval_c),
                            addmod(mulmod(betaXi, k2, q), gamma, q) ,q), q)
                t2 := mulmod(t2, calldataload(pEval_z), q)

                //Let's use t1 as a temporal variable to save one local
                t1 := addmod(calldataload(pEval_a), addmod(mulmod(mload(add(pMem, pBeta)), calldataload(pEval_s1), q), gamma, q) ,q)
                t1 := mulmod(t1,
                      addmod(calldataload(pEval_b), addmod(mulmod(mload(add(pMem, pBeta)), calldataload(pEval_s2), q), gamma, q) ,q), q)
                t1 := mulmod(t1,
                      addmod(calldataload(pEval_c), addmod(mulmod(mload(add(pMem, pBeta)), calldataload(pEval_s3), q), gamma, q) ,q), q)
                t1 := mulmod(t1, calldataload(pEval_zw), q)

                t2:= addmod(t2, mod(sub(q, t1), q), q)
                t2 := mulmod(t2, mload(add(pMem, pZhInv)), q)

                // Compute T1(xi)
                t1 := sub(calldataload(pEval_z), 1)
                t1 := mulmod(t1, mload(add(pMem, pEval_l1)) ,q)
                t1 := mulmod(t1, mload(add(pMem, pZhInv)) ,q)

                // Let's use local variable gamma to save the result
                gamma:=0
                
                let hw
                let c2Value 

                hw := mload(add(pMem, pH2w3_0))
                c2Value := addmod(calldataload(pEval_z), mulmod(hw, t1, q), q)
                c2Value := addmod(c2Value, mulmod(mulmod(hw, hw, q), t2, q), q)
                gamma := addmod(gamma, mulmod(c2Value, mulmod(num, mload(add(pMem, add(pLiS2Inv, mul(0, 32)))), q), q), q)

                hw := mload(add(pMem, pH2w3_1))
                c2Value := addmod(calldataload(pEval_z), mulmod(hw, t1, q), q)
                c2Value := addmod(c2Value, mulmod(mulmod(hw, hw, q), t2, q), q)
                gamma := addmod(gamma, mulmod(c2Value, mulmod(num, mload(add(pMem, add(pLiS2Inv, mul(1, 32)))), q), q), q)

                hw := mload(add(pMem, pH2w3_2))
                c2Value := addmod(calldataload(pEval_z), mulmod(hw, t1, q), q)
                c2Value := addmod(c2Value, mulmod(mulmod(hw, hw, q), t2, q), q)
                gamma := addmod(gamma, mulmod(c2Value, mulmod(num, mload(add(pMem, add(pLiS2Inv, mul(2, 32)))), q), q), q)

                hw := mload(add(pMem, pH3w3_0))
                c2Value := addmod(calldataload(pEval_zw), mulmod(hw, calldataload(pEval_t1w), q), q)
                c2Value := addmod(c2Value, mulmod(mulmod(hw, hw, q), calldataload(pEval_t2w), q), q)
                gamma := addmod(gamma, mulmod(c2Value, mulmod(num, mload(add(pMem, add(pLiS2Inv, mul(3, 32)))), q), q), q)

                hw := mload(add(pMem, pH3w3_1))
                c2Value := addmod(calldataload(pEval_zw), mulmod(hw, calldataload(pEval_t1w), q), q)
                c2Value := addmod(c2Value, mulmod(mulmod(hw, hw, q), calldataload(pEval_t2w), q), q)
                gamma := addmod(gamma, mulmod(c2Value, mulmod(num, mload(add(pMem, add(pLiS2Inv, mul(4, 32)))), q), q), q)

                hw := mload(add(pMem, pH3w3_2))
                c2Value := addmod(calldataload(pEval_zw), mulmod(hw, calldataload(pEval_t1w), q), q)
                c2Value := addmod(c2Value, mulmod(mulmod(hw, hw, q), calldataload(pEval_t2w), q), q)
                gamma := addmod(gamma, mulmod(c2Value, mulmod(num, mload(add(pMem, add(pLiS2Inv, mul(5, 32)))), q), q), q)

                mstore(add(pMem, pR2), gamma)
            }

            // G1 function to accumulate a G1 value to an address
            function g1_acc(pR, pP) {
                let mIn := mload(0x40)
                mstore(mIn, mload(pR))
                mstore(add(mIn, 32), mload(add(pR, 32)))
                mstore(add(mIn, 64), mload(pP))
                mstore(add(mIn, 96), mload(add(pP, 32)))

                let success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            // G1 function to multiply a G1 value to value in an address
            function g1_mulAcc(pR, pP, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, calldataload(pP))
                mstore(add(mIn, 32), calldataload(add(pP, 32)))
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function computeFEJ(pMem) {
                // Prepare shared numerator between F, E and J to reuse it
                let y := mload(add(pMem, pY))
                let numerator := addmod(y, mod(sub(q, mload(add(pMem, pH0w8_0))), q), q)
                numerator := mulmod(numerator, addmod(y, mod(sub(q, mload(add(pMem, pH0w8_1))), q), q), q)
                numerator := mulmod(numerator, addmod(y, mod(sub(q, mload(add(pMem, pH0w8_2))), q), q), q)
                numerator := mulmod(numerator, addmod(y, mod(sub(q, mload(add(pMem, pH0w8_3))), q), q), q)
                numerator := mulmod(numerator, addmod(y, mod(sub(q, mload(add(pMem, pH0w8_4))), q), q), q)
                numerator := mulmod(numerator, addmod(y, mod(sub(q, mload(add(pMem, pH0w8_5))), q), q), q)
                numerator := mulmod(numerator, addmod(y, mod(sub(q, mload(add(pMem, pH0w8_6))), q), q), q)
                numerator := mulmod(numerator, addmod(y, mod(sub(q, mload(add(pMem, pH0w8_7))), q), q), q)

                // Prepare shared quotient between F and E to reuse it
                let quotient1 := mulmod(mload(add(pMem, pAlpha)), mulmod(numerator, mload(add(pMem, pDenH1)), q), q)
                let quotient2 := mulmod(mulmod(mload(add(pMem, pAlpha)), mload(add(pMem, pAlpha)), q), mulmod(numerator, mload(add(pMem, pDenH2)), q), q)

                // Compute full batched polynomial commitment [F]_1
                mstore(add(pMem, pF), C0x)
                mstore(add(pMem, add(pF, 32)), C0y)
                g1_mulAcc(add(pMem, pF), pC1, quotient1)
                g1_mulAcc(add(pMem, pF), pC2, quotient2)

                // Compute group-encoded batch evaluation [E]_1
                g1_mulAccC(add(pMem, pE), G1x, G1y, addmod(mload(add(pMem, pR0)), addmod(mulmod(quotient1, mload(add(pMem, pR1)),q), mulmod(quotient2, mload(add(pMem, pR2)),q), q), q))

                // Compute the full difference [J]_1
                g1_mulAcc(add(pMem, pJ), pW1, numerator)
            }

            // Validate all evaluations with a pairing checking that e([F]_1 - [E]_1 - [J]_1 + y[W2]_1, [1]_2) == e([W']_1, [x]_2)
            function checkPairing(pMem) -> isOk {
                let mIn := mload(0x40)

                // First pairing value
                // Compute -E
                mstore(add(add(pMem, pE), 32), mod(sub(qf, mload(add(add(pMem, pE), 32))), qf))
                // Compute -J
                mstore(add(add(pMem, pJ), 32), mod(sub(qf, mload(add(add(pMem, pJ), 32))), qf))
                // F = F - E - J + y·W2
                g1_acc(add(pMem, pF), add(pMem, pE))
                g1_acc(add(pMem, pF), add(pMem, pJ))
                g1_mulAcc(add(pMem, pF), pW2, mload(add(pMem, pY)))

                mstore(mIn, mload(add(pMem, pF)))
                mstore(add(mIn, 32), mload(add(add(pMem, pF), 32)))

                // Second pairing value
                mstore(add(mIn, 64), G2x2)
                mstore(add(mIn, 96), G2x1)
                mstore(add(mIn, 128), G2y2)
                mstore(add(mIn, 160), G2y1)

                // Third pairing value
                // Compute -W2
                mstore(add(mIn, 192), calldataload(pW2))
                let s := calldataload(add(pW2, 32))
                s := mod(sub(qf, s), qf)
                mstore(add(mIn, 224), s)

                // Fourth pairing value
                mstore(add(mIn, 256), X2x2)
                mstore(add(mIn, 288), X2x1)
                mstore(add(mIn, 320), X2y2)
                mstore(add(mIn, 352), X2y1)

                let success := staticcall(sub(gas(), 2000), 8, mIn, 384, mIn, 0x20)

                isOk := and(success, mload(mIn))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, lastMem))

            // Check proof data is well-formed
            checkProofData()

            // Compute the challenges: beta, gamma, xi, alpha and y ∈ F, h1w4/h2w3/h3w3 roots, xiN and zh(xi)
            computeChallenges(pMem, pubSignals)

            // To divide prime fields the Extended Euclidean Algorithm for computing modular inverses is needed.
            // The Montgomery batch inversion algorithm allow us to compute n inverses reducing to a single one inversion.
            // More info: https://vitalik.ca/general/2018/07/21/starks_part_3.html
            // To avoid this single inverse computation on-chain, it has been computed in proving time and send it to the verifier.
            // Therefore, the verifier:
            //      1) Prepare all the denominators to inverse
            //      2) Check the inverse sent by the prover it is what it should be
            //      3) Compute the others inverses using the Montgomery Batched Algorithm using the inverse sent to avoid the inversion operation it does.
            computeInversions(pMem)

            // Compute Lagrange polynomial evaluations Li(xi)
            computeLagrange(pMem)

            // Compute public input polynomial evaluation PI(xi) = \\sum_i^l -public_input_i·L_i(xi)
            computePi(pMem, pubSignals)

            // Computes r1(y) and r2(y)
            computeR0(pMem)
            computeR1(pMem)
            computeR2(pMem)

            // Compute full batched polynomial commitment [F]_1, group-encoded batch evaluation [E]_1 and the full difference [J]_1
            computeFEJ(pMem)

            // Validate all evaluations
            let isValid := checkPairing(pMem)

            mstore(0, isValid)
            return(0, 0x20)
        }
    }
}
`;
