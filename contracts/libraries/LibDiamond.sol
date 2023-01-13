// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* Author: Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
* EIP-2535 Diamonds: https://eips.ethereum.org/EIPS/eip-2535
/******************************************************************************/
import {IDiamondCut} from "../facets/interfaces/IDiamondCut.sol";
import {Errors} from "./helpers/Errors.sol";

// Remember to add the loupe functions from DiamondLoupeFacet to the diamond.
// The loupe functions are required by the EIP2535 Diamonds standard

error InitializationFunctionReverted(
    address _initializationContractAddress,
    bytes _calldata
);

library LibDiamond {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("diamond.standard.diamond.storage");

    struct FacetAddressAndPosition {
        address facetAddress;
        uint96 functionSelectorPosition; // position in facetFunctionSelectors.functionSelectors array
    }

    struct FacetFunctionSelectors {
        bytes4[] functionSelectors;
        uint256 facetAddressPosition; // position of facetAddress in facetAddresses array
    }

    struct Queue {
        mapping(bytes4 => uint256) queued;
    }

    struct RevertFunction { 
        mapping(bytes4 => uint256) timeUpgraded;
        mapping(bytes4 => address) oldAddress;
    }

    struct DiamondStorage {
        // maps function selector to the facet address and
        // the position of the selector in the facetFunctionSelectors.selectors array
        mapping(bytes4 => FacetAddressAndPosition) selectorToFacetAndPosition;
        // maps facet addresses to function selectors
        mapping(address => FacetFunctionSelectors) facetFunctionSelectors;
        // facet addresses
        address[] facetAddresses;
        // Used to query if a contract implements an interface.
        // Used to implement ERC-165.
        mapping(bytes4 => bool) supportedInterfaces;
        // owner of the contract
        address contractOwner;
        // Address of treasury balance
        address treasury;
        // Address of team balance
        address team;
        // Team Fee in Basis Points
        uint256 teamFeeBp;
        // Maps facet address and function selector to time added
        mapping(address => Queue) queueAddFunction;
        // Maps facet address and function selector to time replaced
        mapping(address => Queue) queueReplaceFunction;
        // Maps facet address and function selector queued function removal
        mapping(address => Queue) queueRemoveFunction;
        // Maps facet address and function selector queued function revert
        mapping(address => Queue) queueRevertFunction;
        //Maps previous facet implementation with new facet implementation to keep track in case of revert
        mapping(address => RevertFunction) revertFunction;
        // Timelock duration
        uint256 timelock;
        // Timelock Queue
        uint256 timelockQueue;
    }

    function diamondStorage()
        internal
        pure
        returns (DiamondStorage storage ds)
    {
        bytes32 position = DIAMOND_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    function setContractOwner(address _newOwner) internal {
        DiamondStorage storage ds = diamondStorage();
        address previousOwner = ds.contractOwner;
        ds.contractOwner = _newOwner;
        emit OwnershipTransferred(previousOwner, _newOwner);
    }

    function contractOwner() internal view returns (address contractOwner_) {
        contractOwner_ = diamondStorage().contractOwner;
    }

    function enforceIsContractOwner() internal view {
        require(
            msg.sender == diamondStorage().contractOwner,
            Errors.NOT_OWNER
        );
    }

    event DiamondCut(
        IDiamondCut.FacetCut[] _diamondCut,
        address _init,
        bytes _calldata
    );

    // Internal function version of diamondCut
    function diamondCut(
        IDiamondCut.FacetCut[] memory _diamondCut,
        address _init,
        bytes memory _calldata
    ) internal {
        for (
            uint256 facetIndex;
            facetIndex < _diamondCut.length;
            facetIndex++
        ) {
            IDiamondCut.FacetCutAction action = _diamondCut[facetIndex].action;
            if (action == IDiamondCut.FacetCutAction.AddQueued) {
                queueFunctions(
                    _diamondCut[facetIndex].facetAddress,
                    _diamondCut[facetIndex].functionSelectors,
                    action
                );
            } else if (action == IDiamondCut.FacetCutAction.Add) {
                addFunctions(
                    _diamondCut[facetIndex].facetAddress,
                    _diamondCut[facetIndex].functionSelectors
                );
            } else if (action == IDiamondCut.FacetCutAction.ReplaceQueued) {
                queueFunctions(
                    _diamondCut[facetIndex].facetAddress,
                    _diamondCut[facetIndex].functionSelectors,
                    action
                );
            } else if (action == IDiamondCut.FacetCutAction.Replace) {
                replaceFunctions(
                    _diamondCut[facetIndex].facetAddress,
                    _diamondCut[facetIndex].functionSelectors
                );
            } else if (action == IDiamondCut.FacetCutAction.RemoveQueued) {
                queueFunctions(
                    _diamondCut[facetIndex].facetAddress,
                    _diamondCut[facetIndex].functionSelectors,
                    action
                );
            } else if (action == IDiamondCut.FacetCutAction.Remove) {
                removeFunctions(
                    _diamondCut[facetIndex].facetAddress,
                    _diamondCut[facetIndex].functionSelectors
                );
            } else if (action == IDiamondCut.FacetCutAction.RevertQueued) {
                queueFunctions(
                    _diamondCut[facetIndex].facetAddress,
                    _diamondCut[facetIndex].functionSelectors,
                    action
                );
            } else if (action == IDiamondCut.FacetCutAction.Revert) {
                revertFunction(
                    _diamondCut[facetIndex].facetAddress,
                    _diamondCut[facetIndex].functionSelectors
                );
            } else {
                revert(Errors.WRONG_ACTION);
            }
        }
        
        emit DiamondCut(_diamondCut, _init, _calldata); // TODO: check causing an error for some reason
        initializeDiamondCut(_init, _calldata);
    }

    function queueAndSetTimelock(bool _queue, uint256 _timelock) internal {
        DiamondStorage storage ds = diamondStorage();
        if(_queue){
            ds.timelockQueue = block.timestamp;
        } else {
            require(ds.timelockQueue > 0, Errors.FUNCTION_NOT_QUEUED);
            require(block.timestamp > ds.timelockQueue + ds.timelock, Errors.FUNCTION_TIMELOCKED);
            require(_timelock > 0, Errors.TIMELOCK_ZERO);
            ds.timelock = _timelock;
        }
    }

    // queues function for addition/removal
    function queueFunctions(address _facetAddress, bytes4[] memory _functionSelectors, IDiamondCut.FacetCutAction _action) internal {
        DiamondStorage storage ds = diamondStorage();
        if(_action == IDiamondCut.FacetCutAction.AddQueued){
            require(
            _functionSelectors.length > 0,
            Errors.NO_SELECTORS
            );
            require(
                _facetAddress != address(0),
                Errors.FACET_ADDRESS_NOT_ZERO
            );

            for(uint256 selectorIndex; selectorIndex < _functionSelectors.length; ++selectorIndex){
                bytes4 selector = _functionSelectors[selectorIndex];
                address oldFacetAddress = ds
                    .selectorToFacetAndPosition[selector]
                    .facetAddress;

                require(
                    oldFacetAddress == address(0),
                    Errors.FUNCTION_EXISTS
                );

                ds.queueAddFunction[_facetAddress].queued[selector] = block.timestamp;
            }

        } else if (_action == IDiamondCut.FacetCutAction.RemoveQueued) {
            // if function does not exist then do nothing and return
            require(
                _facetAddress == address(0),
                Errors.REMOVE_EQUALS_ZERO
            );

            for(uint256 selectorIndex; selectorIndex < _functionSelectors.length; ++selectorIndex){
                bytes4 selector = _functionSelectors[selectorIndex];
                address oldFacetAddress = ds
                    .selectorToFacetAndPosition[selector]
                    .facetAddress;

                require(oldFacetAddress != address(0), Errors.FUNCTION_DOESNT_EXIST);

                ds.queueRemoveFunction[oldFacetAddress].queued[selector] = block.timestamp;
            }

        } else if (_action == IDiamondCut.FacetCutAction.RevertQueued) {
            require(
                _functionSelectors.length > 0,
                Errors.NO_SELECTORS
            );
            require(
                _facetAddress != address(0),
                Errors.FACET_ADDRESS_NOT_ZERO
            );

            for(uint256 selectorIndex; selectorIndex < _functionSelectors.length; ++selectorIndex){
                bytes4 selector = _functionSelectors[selectorIndex];
                address currentFacetAddress = ds
                    .selectorToFacetAndPosition[selector]
                    .facetAddress;

                require(
                    currentFacetAddress != _facetAddress,
                    Errors.REVERT_FUNCTION_SAME_ADDRESS
                );

                address oldFacetAddress = ds.revertFunction[currentFacetAddress].oldAddress[selector];

                require(oldFacetAddress == _facetAddress, Errors.FACET_ADDRESS_DOESNT_MATCH);

                uint256 timeUpgraded = ds.revertFunction[currentFacetAddress].timeUpgraded[selector];

                require(timeUpgraded + 30 days > block.timestamp, Errors.REVERT_TIME_EXCEEDED);

                ds.queueRevertFunction[_facetAddress].queued[selector] = block.timestamp;
            }
        } else if (_action == IDiamondCut.FacetCutAction.ReplaceQueued){
            require(
                _functionSelectors.length > 0,
                Errors.NO_SELECTORS
            );
            require(
                _facetAddress != address(0),
                Errors.FACET_ADDRESS_NOT_ZERO
            );

            for(uint256 selectorIndex; selectorIndex < _functionSelectors.length; ++selectorIndex){
                bytes4 selector = _functionSelectors[selectorIndex];
                address oldFacetAddress = ds
                    .selectorToFacetAndPosition[selector]
                    .facetAddress;

                require(
                    oldFacetAddress != _facetAddress,
                    Errors.SAME_FUNCTION
                );

                ds.queueReplaceFunction[_facetAddress].queued[selector] = block.timestamp;
            }
        }
    }

    function addFunctions(
        address _facetAddress,
        bytes4[] memory _functionSelectors
    ) internal {
        require(
            _functionSelectors.length > 0,
            Errors.NO_SELECTORS
        );
        DiamondStorage storage ds = diamondStorage();
        require(
            _facetAddress != address(0),
            Errors.FACET_ADDRESS_NOT_ZERO
        );
        uint96 selectorPosition = uint96(
            ds.facetFunctionSelectors[_facetAddress].functionSelectors.length
        );
        // add new facet address if it does not exist
        if (selectorPosition == 0) {
            addFacet(ds, _facetAddress);
        }
        for (
            uint256 selectorIndex;
            selectorIndex < _functionSelectors.length;
            ++selectorIndex
        ) {
            bytes4 selector = _functionSelectors[selectorIndex];
            address oldFacetAddress = ds
                .selectorToFacetAndPosition[selector]
                .facetAddress;
            require(
                oldFacetAddress == address(0),
                Errors.FUNCTION_EXISTS
            );
            uint256 timeQueued = ds.queueAddFunction[_facetAddress].queued[selector];
            require(timeQueued > 0, Errors.FUNCTION_NOT_QUEUED);
            require(block.timestamp >= timeQueued + ds.timelock, Errors.FUNCTION_TIMELOCKED);
            addFunction(ds, selector, selectorPosition, _facetAddress);
            selectorPosition++;
        }
    }

    // reverts back a replaced(upgraded function) to its earlier implementation
    function revertFunction(address _facetAddress, bytes4[] memory _functionSelectors) internal {
        require(
            _functionSelectors.length > 0,
            Errors.NO_SELECTORS
        );
        DiamondStorage storage ds = diamondStorage();
        require(
            _facetAddress != address(0),
            Errors.REVERT_ADDRESS
        );
        uint96 selectorPosition = uint96(ds.facetFunctionSelectors[_facetAddress].functionSelectors.length);
        for (
            uint256 selectorIndex;
            selectorIndex < _functionSelectors.length;
            ++selectorIndex
        ) {
            bytes4 selector = _functionSelectors[selectorIndex];
            address currentFacetAddress = ds
                .selectorToFacetAndPosition[selector]
                .facetAddress;

            uint256 timeQueued = ds.queueRevertFunction[_facetAddress].queued[selector];
            require(timeQueued > 0, Errors.FUNCTION_NOT_QUEUED);
            require(block.timestamp > timeQueued + 1 days, Errors.FUNCTION_TIMELOCKED);

            require(
                currentFacetAddress != _facetAddress,
                Errors.REVERT_FUNCTION_SAME_ADDRESS
            );
            address oldFacetAddress = ds.revertFunction[currentFacetAddress].oldAddress[selector];

            require(oldFacetAddress == _facetAddress, Errors.FACET_ADDRESS_DOESNT_MATCH);

            uint256 timeUpgraded = ds.revertFunction[currentFacetAddress].timeUpgraded[selector];

            require(timeUpgraded + 30 days > block.timestamp, Errors.REVERT_TIME_EXCEEDED);

            removeFunction(ds, currentFacetAddress, selector);
            addFunction(ds, selector, selectorPosition, oldFacetAddress);
            selectorPosition++;
        }
    }

    function replaceFunctions(
        address _facetAddress,
        bytes4[] memory _functionSelectors
    ) internal {
        require(
            _functionSelectors.length > 0,
            Errors.NO_SELECTORS
        );
        DiamondStorage storage ds = diamondStorage();
        require(
            _facetAddress != address(0),
            Errors.FACET_ADDRESS_NOT_ZERO
        );
        uint96 selectorPosition = uint96(
            ds.facetFunctionSelectors[_facetAddress].functionSelectors.length
        );
        // add new facet address if it does not exist
        if (selectorPosition == 0) {
            addFacet(ds, _facetAddress);
        }
        for (
            uint256 selectorIndex;
            selectorIndex < _functionSelectors.length;
            ++selectorIndex
        ) {
            bytes4 selector = _functionSelectors[selectorIndex];
            address oldFacetAddress = ds
                .selectorToFacetAndPosition[selector]
                .facetAddress;

            require(
                oldFacetAddress != _facetAddress,
                Errors.SAME_FUNCTION
            );

            ds.revertFunction[_facetAddress].oldAddress[selector] = oldFacetAddress;

            ds.revertFunction[_facetAddress].timeUpgraded[selector] = block.timestamp;

            uint256 timeQueued = ds.queueReplaceFunction[_facetAddress].queued[selector];

            require(timeQueued > 0, Errors.FUNCTION_NOT_QUEUED);
            require(block.timestamp > timeQueued + 1 days, Errors.FUNCTION_TIMELOCKED);

            removeFunction(ds, oldFacetAddress, selector);
            addFunction(ds, selector, selectorPosition, _facetAddress);
            selectorPosition++;
        }
    }

    function removeFunctions(
        address _facetAddress,
        bytes4[] memory _functionSelectors
    ) internal {
        require(
            _functionSelectors.length > 0,
            Errors.NO_SELECTORS
        );
        DiamondStorage storage ds = diamondStorage();
        // if function does not exist then do nothing and return
        require(
            _facetAddress == address(0),
            Errors.REMOVE_EQUALS_ZERO
        );
        for (
            uint256 selectorIndex;
            selectorIndex < _functionSelectors.length;
            ++selectorIndex
        ) {
            bytes4 selector = _functionSelectors[selectorIndex];
            address oldFacetAddress = ds
                .selectorToFacetAndPosition[selector]
                .facetAddress;

            uint256 timeQueued = ds.queueRemoveFunction[oldFacetAddress].queued[selector];
            require(timeQueued > 0, Errors.FUNCTION_NOT_QUEUED);
            require(block.timestamp > timeQueued + 1 days, Errors.FUNCTION_TIMELOCKED);

            removeFunction(ds, oldFacetAddress, selector);
        }
    }

    function addFacet(
        DiamondStorage storage ds,
        address _facetAddress
    ) internal {
        enforceHasContractCode(
            _facetAddress,
            Errors.FACET_HAS_NO_CODE
        );
        ds.facetFunctionSelectors[_facetAddress].facetAddressPosition = ds
            .facetAddresses
            .length;
        ds.facetAddresses.push(_facetAddress);
    }

    function addFunction(
        DiamondStorage storage ds,
        bytes4 _selector,
        uint96 _selectorPosition,
        address _facetAddress
    ) internal {
        ds
            .selectorToFacetAndPosition[_selector]
            .functionSelectorPosition = _selectorPosition;
        
        ds.facetFunctionSelectors[_facetAddress].functionSelectors.push(
            _selector
        );

        ds.selectorToFacetAndPosition[_selector].facetAddress = _facetAddress;
    }

    function removeFunction(
        DiamondStorage storage ds,
        address _facetAddress,
        bytes4 _selector
    ) internal {
        require(
            _facetAddress != address(0),
            Errors.FUNCTION_DOESNT_EXIST_FACET
        );
        // an immutable function is a function defined directly in a diamond
        require(
            _facetAddress != address(this),
            Errors.IMMUTABLE_FUNCTION
        );
        // replace selector with last selector, then delete last selector
        uint256 selectorPosition = ds
            .selectorToFacetAndPosition[_selector]
            .functionSelectorPosition;
        uint256 lastSelectorPosition = ds
            .facetFunctionSelectors[_facetAddress]
            .functionSelectors
            .length - 1;
        // if not the same then replace _selector with lastSelector
        if (selectorPosition != lastSelectorPosition) {
            bytes4 lastSelector = ds
                .facetFunctionSelectors[_facetAddress]
                .functionSelectors[lastSelectorPosition];
            ds.facetFunctionSelectors[_facetAddress].functionSelectors[
                    selectorPosition
                ] = lastSelector;
            ds
                .selectorToFacetAndPosition[lastSelector]
                .functionSelectorPosition = uint96(selectorPosition);
        }
        // delete the last selector
        ds.facetFunctionSelectors[_facetAddress].functionSelectors.pop();
        delete ds.selectorToFacetAndPosition[_selector];

        // if no more selectors for facet address then delete the facet address
        if (lastSelectorPosition == 0) {
            // replace facet address with last facet address and delete last facet address
            uint256 lastFacetAddressPosition = ds.facetAddresses.length - 1;
            uint256 facetAddressPosition = ds
                .facetFunctionSelectors[_facetAddress]
                .facetAddressPosition;
            if (facetAddressPosition != lastFacetAddressPosition) {
                address lastFacetAddress = ds.facetAddresses[
                    lastFacetAddressPosition
                ];
                ds.facetAddresses[facetAddressPosition] = lastFacetAddress;
                ds
                    .facetFunctionSelectors[lastFacetAddress]
                    .facetAddressPosition = facetAddressPosition;
            }
            ds.facetAddresses.pop();
            delete ds
                .facetFunctionSelectors[_facetAddress]
                .facetAddressPosition;
        }
    }

    function initializeDiamondCut(
        address _init,
        bytes memory _calldata
    ) internal {
        if (_init == address(0)) {
            return;
        }
        enforceHasContractCode(
            _init,
            Errors.INIT_HAS_NO_CODE
        );
        (bool success, bytes memory error) = _init.delegatecall(_calldata);
        if (!success) {
            if (error.length > 0) {
                // bubble up error
                /// @solidity memory-safe-assembly
                assembly {
                    let returndata_size := mload(error)
                    revert(add(32, error), returndata_size)
                }
            } else {
                revert InitializationFunctionReverted(_init, _calldata);
            }
        }
    }

    function enforceHasContractCode(
        address _contract,
        string memory _errorMessage
    ) internal view {
        uint256 contractSize;
        assembly {
            contractSize := extcodesize(_contract)
        }
        require(contractSize > 0, _errorMessage);
    }
}
