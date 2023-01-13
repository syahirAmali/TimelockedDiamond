import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { increase } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time/increase.js";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect, assert } from "chai";
import { ethers } from "hardhat";
import {
  getSelectors,
  FacetCutAction,
  removeSelectors,
  findAddressPositionInFacets,
} from "../scripts/libraries/diamond";

import { deployBaseDiamond } from "../scripts/deploy";
import { DiamondCutFacet, DiamondLoupeFacet, OwnershipFacet, Test1Facet } from "../typechain-types";

let owner, user1;
let diamond: string;
let loupeFacet: DiamondLoupeFacet, cutFacet: DiamondCutFacet, ownerFacet: OwnershipFacet, test1Facet: Test1Facet;

const ownerSel = '0x8da5cb5b'

const sel0 = '0x19e3b533' // fills up slot 1
const sel1 = '0x0716c2ae' // fills up slot 1
const sel2 = '0x11046047' // fills up slot 1
const sel3 = '0xcf3bbe18' // fills up slot 1
const sel4 = '0x24c1d5a7' // fills up slot 1
const sel5 = '0xcbb835f6' // fills up slot 1
const sel6 = '0xcbb835f7' // fills up slot 1
const sel7 = '0xcbb835f8' // fills up slot 2
const sel8 = '0xcbb835f9' // fills up slot 2
const sel9 = '0xcbb835fa' // fills up slot 2
const sel10 = '0xcbb835fb' // fills up slot 2

// This bug manifests if you delete something from the final
// selector slot array, so we'll fill up a new slot with
// things, and have a fresh row to work with
describe("Timelock Diamond", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function diamondFixture() {
    const [
      ownerAccount,
      user1Account,
    ] = await ethers.getSigners();

    let selectors = [
        sel0,
        sel1,
        sel2,
        sel3,
        sel4,
        sel5,
        sel6,
        sel7,
        sel8,
        sel9,
        sel10
    ]

    owner = ownerAccount;
    user1 = user1Account;

    const [diamondAddress, facets] = await deployBaseDiamond(owner);

    const Test1Facet = await ethers.getContractFactory("Test1Facet");
    test1Facet = await Test1Facet.deploy();
    await test1Facet.deployed();

    cutFacet = facets.cut;
    loupeFacet = facets.loupe;
    ownerFacet =  facets.owner;

    diamond = diamondAddress;

    let tx = await cutFacet.diamondCut([
        {
          facetAddress: test1Facet.address,
          action: FacetCutAction.AddQueued,
          functionSelectors: selectors
        }
    ], ethers.constants.AddressZero, '0x');

    let receipt = await tx.wait();

    if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`)
    }

    tx = await cutFacet.diamondCut([
        {
          facetAddress: test1Facet.address,
          action: FacetCutAction.Add,
          functionSelectors: selectors
        }
      ], ethers.constants.AddressZero, '0x');

    receipt = await tx.wait();

    if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`)
    }
  
    // Remove function selectors
    // Function selector for the owner function in slot 0
    selectors = [
        ownerSel, // owner selector
        sel5,
        sel10
    ];

    tx = await cutFacet.diamondCut([
        {
          facetAddress: ethers.constants.AddressZero,
          action: FacetCutAction.RemoveQueued,
          functionSelectors: selectors
        }
    ], ethers.constants.AddressZero, '0x');
      
    receipt = await tx.wait();

    if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`)
    }

    tx = await cutFacet.diamondCut([
        {
          facetAddress: ethers.constants.AddressZero,
          action: FacetCutAction.Remove,
          functionSelectors: selectors
        }
    ], ethers.constants.AddressZero, '0x');
      
    receipt = await tx.wait();

    if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`)
    }

    return { diamond };
  }

  describe("Deployment", function () {
    it("Should deploy base diamond", async function () {
      const { diamond } = await loadFixture(diamondFixture);
      console.log("Diamond address", diamond);
    });

  });

  describe("Diamond Test", () => {
    it("1. Should not exhibit the cache bug", async () => {
        // Get the test1Facet's registered functions
        let selectors = await loupeFacet.facetFunctionSelectors(test1Facet.address)

        // Check individual correctness
        assert.isTrue(selectors.includes(sel0), 'Does not contain sel0')
        assert.isTrue(selectors.includes(sel1), 'Does not contain sel1')
        assert.isTrue(selectors.includes(sel2), 'Does not contain sel2')
        assert.isTrue(selectors.includes(sel3), 'Does not contain sel3')
        assert.isTrue(selectors.includes(sel4), 'Does not contain sel4')
        assert.isTrue(selectors.includes(sel6), 'Does not contain sel6')
        assert.isTrue(selectors.includes(sel7), 'Does not contain sel7')
        assert.isTrue(selectors.includes(sel8), 'Does not contain sel8')
        assert.isTrue(selectors.includes(sel9), 'Does not contain sel9')

        assert.isFalse(selectors.includes(ownerSel), 'Contains ownerSel')
        assert.isFalse(selectors.includes(sel10), 'Contains sel10')
        assert.isFalse(selectors.includes(sel5), 'Contains sel5')
    });
  });

});
