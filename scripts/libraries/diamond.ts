/* global ethers */

import { ErrorFragment, Fragment, FunctionFragment, JsonFragment } from "@ethersproject/abi"
import { Contract } from "ethers"
import { ethers } from "hardhat"
import { DiamondCutFacet, DiamondLoupeFacet, OwnershipFacet, Test1Facet, Test1FacetUpgrade__factory, Test1Facet__factory, Test2Facet, Test2Facet__factory } from "../../typechain-types"

export const FacetCutAction = { AddQueued: 0, Add: 1, RemoveQueued: 2, Remove: 3, ReplaceQueued: 4, Replace: 5, RevertQueued: 6, Revert: 7 }

// get function selectors from ABI
export function getSelectors (contract: DiamondCutFacet | Contract | DiamondLoupeFacet | OwnershipFacet | Test1Facet__factory | Test1Facet | Test2Facet__factory | Test2Facet | Test1FacetUpgrade__factory) {
  const signatures = Object.keys(contract.interface.functions)
  const selectors: any = signatures.reduce((acc: string[], val: string) => {
    if (val !== 'init(bytes)') {
      acc.push(contract.interface.getSighash(val))
    }
    return acc
  }, [])

  selectors.contract = contract
  selectors.remove = remove
  selectors.get = get
  return selectors
}

// get function selector from function signature
export function getSelector (func: string) {
  const abiInterface = new ethers.utils.Interface([func])
  return abiInterface.getSighash(ethers.utils.Fragment.from(func))
}

// used with getSelectors to remove selectors from an array of selectors
// functionNames argument is an array of function signatures
export function remove (this: any, functionNames: any) {
  const selectors = this.filter((v: any) => {
    for (const functionName of functionNames) {
      if (v === this.contract.interface.getSighash(functionName)) {
        return false
      }
    }
    return true
  })

  selectors.contract = this.contract
  selectors.remove = this.remove
  selectors.get = this.get
  return selectors
}

// used with getSelectors to get selectors from an array of selectors
// functionNames argument is an array of function signatures
export function get (this: any, functionNames: any) {
  const selectors = this.filter((v: any) => {
    for (const functionName of functionNames) {
      if (v === this.contract.interface.getSighash(functionName)) {
        return true
      }
    }
    return false
  })
  selectors.contract = this.contract
  selectors.remove = this.remove
  selectors.get = this.get
  return selectors
}

// remove selectors using an array of signatures
export function removeSelectors (selectors: string[], signatures: string[]) {
  const iface = new ethers.utils.Interface(signatures.map((v: string) => 'function ' + v))
  const removeSelectors = signatures.map((v: string) => iface.getSighash(v))
  selectors = selectors.filter((v: any) => !removeSelectors.includes(v))
  return selectors
}

// find a particular address position in the return value of diamondLoupeFacet.facets()
export function findAddressPositionInFacets (facetAddress: any, facets: string | any[]) {
  for (let i = 0; i < facets.length; i++) {
    if (facets[i].facetAddress === facetAddress) {
      return i
    }
  }
}

exports.getSelectors = getSelectors
exports.getSelector = getSelector
exports.FacetCutAction = FacetCutAction
exports.remove = remove
exports.removeSelectors = removeSelectors
exports.findAddressPositionInFacets = findAddressPositionInFacets