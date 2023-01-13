// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

library Errors {
    string public constant NOT_OWNER = "0"; // "LibDiamond: Must be contract owner"
    string public constant FUNCTION_DOESNT_EXIST = "1"; // "Diamond: Function does not exist"
    string public constant NO_SELECTORS = "2"; // "LibDiamondCut: No selectors in facet to cut"
    string public constant FACET_ADDRESS_NOT_ZERO = "3"; // "LibDiamondCut: Add facet can't be address(0)"
    string public constant FUNCTION_EXISTS = "4"; // "LibDiamondCut: Can't add function that already exists"
    string public constant REMOVE_EQUALS_ZERO = "5"; // "LibDiamondCut: Remove facet address must be address(0)"
    string public constant FUNCTION_DOESNT_EXIST_FACET = "6"; // "LibDiamondCut: Function doesn't exist"
    string public constant FUNCTION_NOT_QUEUED = "7"; // "LibDiamondCut: Function has not been queued"
    string public constant FUNCTION_TIMELOCKED = "8"; // "LibDiamondCut: Function still timelocked"
    string public constant WRONG_ACTION = "9"; // "LibDiamondCut: Incorrect FacetCutAction"
    string public constant REVERT_ADDRESS = "10"; // "LibDiamondCut: Revert facet can't be address(0)"
    string public constant FACET_ADDRESS_DOESNT_MATCH = "11"; // "LibDiamondCut: Facet Address doesnt match for revert"
    string public constant REVERT_TIME_EXCEEDED = "12"; // "LibDiamondCut: Function revert time exceeded"
    string public constant REVERT_FUNCTION_SAME_ADDRESS = "13"; // "LibDiamondCut: Can't revert function with same address"
    string public constant FACET_HAS_NO_CODE = "14"; // "LibDiamondCut: New facet has no code"
    string public constant IMMUTABLE_FUNCTION = "15"; // "LibDiamondCut: Can't remove immutable function"
    string public constant INIT_HAS_NO_CODE = "16"; // "LibDiamondCut: _init address has no code"
    string public constant TIMELOCK_ZERO = "17"; // "LibDiamondCut: Timelock value can't be zero"
    string public constant SAME_FUNCTION = "18"; // "LibDiamondCut: Can't replace function with same function"

}
