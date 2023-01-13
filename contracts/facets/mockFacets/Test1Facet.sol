// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library TestLib {

  bytes32 constant DIAMOND_STORAGE_POSITION = keccak256("diamond.standard.test.storage");
  
  struct TestState {
      address myAddress;
      uint256 myNum;
  }

  function diamondStorage() internal pure returns (TestState storage ds) {
      bytes32 position = DIAMOND_STORAGE_POSITION;
      assembly {
          ds.slot := position
      }
  }

  function setMyAddress(address _myAddress) internal {
    TestState storage testState = diamondStorage();
    testState.myAddress = _myAddress;
  }

  function getMyAddress() internal view returns (address) {
    TestState storage testState = diamondStorage();
    return testState.myAddress;
  }
}

contract Test1Facet {
    event TestEvent(address something);

    function test1Func00() external {
      TestLib.setMyAddress(address(this));
    }

    function test1Func0() external view returns (address){
      return TestLib.getMyAddress();
    }

    function test1Func1() external pure returns (uint256) {
        return 1;
    }

    function test1Func2() external pure returns (uint256) {
        return 2;
    }

    function test1Func3() external pure returns (uint256) {
        return 3;
    }

    function test1Func4() external pure returns (uint256) {
        return 4;
    }

    function test1Func5() external pure returns (uint256) {
        return 5;
    }

    function test1Func6() external pure returns (uint256) {
        return 6;
    }

    function test1Func7() external pure returns (uint256) {
        return 7;
    }

    function test1Func8() external pure returns (uint256) {
        return 8;
    }

    function test1Func9() external pure returns (uint256) {
        return 9;
    }

    function test1Func10() external pure returns (uint256) {
        return 10;
    }

    function test1Func11() external pure returns (uint256) {
        return 11;
    }

    function test1Func12() external pure returns (uint256) {
        return 12;
    }

    function test1Func13() external pure returns (uint256) {
        return 13;
    }

    function test1Func14() external pure returns (uint256) {
        return 14;
    }

    function test1Func15() external pure returns (uint256) {
        return 15;
    }

    function test1Func16() external pure returns (uint256) {
        return 16;
    }

    function test1Func17() external pure returns (uint256) {
        return 17;
    }

    function test1Func18() external pure returns (uint256) {
        return 18;
    }

    function test1Func19() external pure returns (uint256) {
        return 19;
    }

    function test1Func20() external pure returns (uint256) {
        return 20;
    }

    function supportsInterface(bytes4 _interfaceID)
        external
        view
        returns (bool)
    {}
}
