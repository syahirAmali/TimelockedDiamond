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
import { DiamondCutFacet, DiamondLoupeFacet, OwnershipFacet } from "../typechain-types";

let owner, user1;
let diamond: string;
let loupeFacet: DiamondLoupeFacet, cutFacet: DiamondCutFacet, ownerFacet: OwnershipFacet;
let totalAdd: string[] = [];

const SECONDS_IN_DAY = 86400;

describe("Timelock Diamond", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function diamondFixture() {
    const [
      ownerAccount,
      user1Account,
    ] = await ethers.getSigners();

    owner = ownerAccount;
    user1 = user1Account;

    const [diamondAddress, facets] = await deployBaseDiamond(owner);

    cutFacet = facets.cut;
    loupeFacet = facets.loupe;
    ownerFacet =  facets.owner;

    diamond = diamondAddress;

    await cutFacet.queueAndSetTimelock(true, 0);
    await cutFacet.queueAndSetTimelock(false, SECONDS_IN_DAY);

    return { diamond };
  }

  describe("Deployment", function () {
    it("Should deploy base diamond", async function () {
      const { diamond } = await loadFixture(diamondFixture);
      console.log("Diamond address", diamond);
    });

  });

  describe("Diamond Test", () => {
    it("1. Diamond is deployed with facets", async () => {
      const addresses = await loupeFacet.facetAddresses();
      expect(addresses.length).to.be.equals(3);
    });

    it("2. Correct function selectors for the facets", async () => {
      const addresses = await loupeFacet.facetAddresses();
      let selectors = getSelectors(cutFacet);
      let result = await loupeFacet.facetFunctionSelectors(addresses[0]);
      assert.sameMembers(result, selectors);
      selectors = getSelectors(loupeFacet);
      result = await loupeFacet.facetFunctionSelectors(addresses[1]);
      assert.sameMembers(result, selectors);
      selectors = getSelectors(ownerFacet);
      result = await loupeFacet.facetFunctionSelectors(addresses[2]);
      assert.sameMembers(result, selectors);
    });

    it("3. Selectors should be associated to the facets corretly", async () => {
      const addresses = await loupeFacet.facetAddresses();
      assert.equal(addresses[0], await loupeFacet.facetAddress("0x1f931c1c"));
      assert.equal(addresses[1], await loupeFacet.facetAddress("0xcdffacc6"));
      assert.equal(addresses[1], await loupeFacet.facetAddress("0x01ffc9a7"));
      assert.equal(addresses[2], await loupeFacet.facetAddress("0xf2fde38b"));
    });

    it("4. Adds test1 functions", async () => {
      const addresses = await loupeFacet.facetAddresses();

      const Test1Facet = await ethers.getContractFactory("Test1Facet");
      const test1Facet = await Test1Facet.deploy();
      await test1Facet.deployed();

      totalAdd.push(
        addresses[0],
        addresses[1],
        addresses[2],
        test1Facet.address
      );

      const selectors = getSelectors(test1Facet).remove([
        "supportsInterface(bytes4)",
      ]);

      const queue = await cutFacet.diamondCut(
        [
          {
            facetAddress: test1Facet.address,
            action: FacetCutAction.AddQueued,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const rcpt = await queue.wait();

      if (!rcpt.status) {
        throw Error(`Diamond upgrade failed: ${queue.hash}`);
      };

      const testFacet = await ethers.getContractAt("Test1Facet", diamond);
      await expect(testFacet.test1Func1()).to.be.revertedWith("1");

      await increase(SECONDS_IN_DAY);

      const tx = await cutFacet.diamondCut(
        [
          {
            facetAddress: test1Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const receipt = await tx.wait();

      if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`);
      };

      const result = await loupeFacet.facetFunctionSelectors(
        test1Facet.address
      );

      assert.sameMembers(result, selectors);
      
    });

    it("5. Test function call after an increase seconds", async () => {
      // increased because of timelock for functions
      await increase(SECONDS_IN_DAY);

      const test1Facet = await ethers.getContractAt("Test1Facet", diamond);
      const value = await test1Facet.test1Func1();
      expect(value).to.equals(1);
    });

    it("6. Replace supportsinterface function", async () => {
      const Test1Facet = await ethers.getContractFactory("Test1Facet");
      const selectors = getSelectors(Test1Facet).get([
        "supportsInterface(bytes4)",
      ]);

      const testFacetAddress = totalAdd[3];
      
      const queue = await cutFacet.diamondCut(
        [
          {
            facetAddress: testFacetAddress,
            action: FacetCutAction.ReplaceQueued,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const rcpt = await queue.wait();

      if (!rcpt.status) {
        throw Error(`Diamond upgrade failed: ${queue.hash}`);
      };

      await increase(SECONDS_IN_DAY);

      const tx = await cutFacet.diamondCut(
        [
          {
            facetAddress: testFacetAddress,
            action: FacetCutAction.Replace,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const receipt = await tx.wait();

      if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`);
      };

      const result = await loupeFacet.facetFunctionSelectors(testFacetAddress);
      assert.sameMembers(result, getSelectors(Test1Facet));

      // If the action is Replace, update the function selector mapping for each functionSelectors item to the facetAddress.
      // If any of the functionSelectors had a value equal to facetAddress or the selector was unset, revert instead.
    });

    it("7. Test function call", async () => {
      const Test2Facet = await ethers.getContractFactory("Test2Facet");
      const test2Facet = await Test2Facet.deploy();
      await test2Facet.deployed();
      totalAdd.push(test2Facet.address);
      const selectors = getSelectors(test2Facet);

      const queue = await cutFacet.diamondCut(
        [
          {
            facetAddress: test2Facet.address,
            action: FacetCutAction.AddQueued,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const rcpt = await queue.wait();

      if (!rcpt.status) {
        throw Error(`Diamond upgrade failed: ${queue.hash}`);
      };

      const testFacet = await ethers.getContractAt("Test2Facet", diamond);
      await expect(testFacet.test2Func1()).to.be.revertedWith("1");

      await increase(SECONDS_IN_DAY);

      const tx = await cutFacet.diamondCut(
        [
          {
            facetAddress: test2Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const receipt = await tx.wait();

      if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`);
      };

      const result = await loupeFacet.facetFunctionSelectors(
        test2Facet.address
      );

      assert.sameMembers(result, selectors);
    });

    it("8. Remove test 2 functions", async () => {
      const test2Facet = await ethers.getContractAt("Test2Facet", diamond);

      const functionsToKeep = [
        "test2Func1()",
        "test2Func5()",
        "test2Func6()",
        "test2Func19()",
        "test2Func20()",
      ];

      const selectors = getSelectors(test2Facet).remove(functionsToKeep);

      const queue = await cutFacet.diamondCut(
        [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.RemoveQueued,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const rcpt = await queue.wait();

      if (!rcpt.status) {
        throw Error(`Diamond queued failed: ${queue.hash}`);
      };

      // increased to satisfy remove timelock queue and remove function
      await increase(SECONDS_IN_DAY);

      const tx = await cutFacet.diamondCut(
        [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.Remove,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const receipt = await tx.wait();

      if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`);
      };

      const result = await loupeFacet.facetFunctionSelectors(totalAdd[4]);
      assert.sameMembers(result, getSelectors(test2Facet).get(functionsToKeep));
    });

    it("9. Remove test 1 functions", async () => {
      const test1Facet = await ethers.getContractAt("Test1Facet", diamond);

      const functionsToKeep = [
        "test1Func2()",
        "test1Func11()",
        "test1Func12()",
      ];

      const selectors = getSelectors(test1Facet).remove(functionsToKeep);

      const queue = await cutFacet.diamondCut(
        [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.RemoveQueued,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const rcpt = await queue.wait();

      if (!rcpt.status) {
        throw Error(`Diamond queued failed: ${queue.hash}`);
      };

      // increased to satisfy remove timelock queue and remove function
      await increase(SECONDS_IN_DAY);

      const tx = await cutFacet.diamondCut(
        [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.Remove,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const receipt = await tx.wait();

      if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`);
      };

      const result = await loupeFacet.facetFunctionSelectors(totalAdd[3]);
      assert.sameMembers(result, getSelectors(test1Facet).get(functionsToKeep));
    });

    it("10. Remove all functions and facets except cut and facets", async () => {
      let selectors = [];
      let facets = await loupeFacet.facets();
      
      for (let i = 0; i < facets.length; i++) {
        selectors.push(...facets[i].functionSelectors);
      };

      selectors = removeSelectors(selectors, [
        "facets()",
        "diamondCut(tuple(address,uint8,bytes4[])[],address,bytes)",
        "queueAndSetTimelock(bool,uint256)",
      ]);

      const queue = await cutFacet.diamondCut(
        [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.RemoveQueued,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const rcpt = await queue.wait();

      if (!rcpt.status) {
        throw Error(`Diamond queued failed: ${queue.hash}`);
      };

      // increased to satisfy remove timelock queue and remove function
      await increase(SECONDS_IN_DAY);

      const tx = await cutFacet.diamondCut(
        [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.Remove,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );
      const receipt = await tx.wait();
      
      if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`);
      };

      facets = await loupeFacet.facets();
      assert.equal(facets.length, 2);
      assert.equal(facets[0][0], totalAdd[0]);
      assert.sameMembers(facets[0][1], ["0x1f931c1c", "0x6ef01d0d"]);
      assert.equal(facets[1][0], totalAdd[1]);
      assert.sameMembers(facets[1][1], ["0x7a0ed627"]);
    });

    it("11. Add most function and facets", async () => {
      const diamondLoupeFacetSelectors = getSelectors(loupeFacet).remove([
        "supportsInterface(bytes4)",
      ]);
      const Test1Facet = await ethers.getContractFactory("Test1Facet");
      const Test2Facet = await ethers.getContractFactory("Test2Facet");

      const cutQueue = [
        {
          facetAddress: totalAdd[1],
          action: FacetCutAction.AddQueued,
          functionSelectors: diamondLoupeFacetSelectors.remove(["facets()"]),
        },
        {
          facetAddress: totalAdd[2],
          action: FacetCutAction.AddQueued,
          functionSelectors: getSelectors(ownerFacet),
        },
        {
          facetAddress: totalAdd[3],
          action: FacetCutAction.AddQueued,
          functionSelectors: getSelectors(Test1Facet),
        },
        {
          facetAddress: totalAdd[4],
          action: FacetCutAction.AddQueued,
          functionSelectors: getSelectors(Test2Facet),
        },
      ];
      const queue = await cutFacet.diamondCut(
        cutQueue,
        ethers.constants.AddressZero,
        "0x"
      );

      const rcpt = await queue.wait();

      if (!rcpt.status) {
        throw Error(`Diamond upgrade failed: ${queue.hash}`);
      };

      // increased because of timelock for functions
      await increase(SECONDS_IN_DAY);

      // Any number of functions from any number of facets can be added/replaced/removed in a
      // single transaction
      const cut = [
        {
          facetAddress: totalAdd[1],
          action: FacetCutAction.Add,
          functionSelectors: diamondLoupeFacetSelectors.remove(["facets()"]),
        },
        {
          facetAddress: totalAdd[2],
          action: FacetCutAction.Add,
          functionSelectors: getSelectors(ownerFacet),
        },
        {
          facetAddress: totalAdd[3],
          action: FacetCutAction.Add,
          functionSelectors: getSelectors(Test1Facet),
        },
        {
          facetAddress: totalAdd[4],
          action: FacetCutAction.Add,
          functionSelectors: getSelectors(Test2Facet),
        },
      ];
      const tx = await cutFacet.diamondCut(
        cut,
        ethers.constants.AddressZero,
        "0x"
      );

      const receipt = await tx.wait();

      if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`);
      };
      
      const facets = await loupeFacet.facets();

      const facetAddresses = await loupeFacet.facetAddresses();
      assert.equal(facetAddresses.length, 5);
      assert.equal(facets.length, 5);
      assert.sameMembers(facetAddresses, totalAdd);
      assert.equal(facets[0][0], facetAddresses[0], "first facet");
      assert.equal(facets[1][0], facetAddresses[1], "second facet");
      assert.equal(facets[2][0], facetAddresses[2], "third facet");
      assert.equal(facets[3][0], facetAddresses[3], "fourth facet");
      assert.equal(facets[4][0], facetAddresses[4], "fifth facet");

      assert.sameMembers(
        facets[findAddressPositionInFacets(totalAdd[0], facets) as number][1],
        getSelectors(cutFacet)
      );
      assert.sameMembers(
        facets[findAddressPositionInFacets(totalAdd[1], facets) as number][1],
        diamondLoupeFacetSelectors
      );
      assert.sameMembers(
        facets[findAddressPositionInFacets(totalAdd[2], facets) as number][1],
        getSelectors(ownerFacet)
      );
      assert.sameMembers(
        facets[findAddressPositionInFacets(totalAdd[3], facets) as number][1],
        getSelectors(Test1Facet)
      );
      assert.sameMembers(
        facets[findAddressPositionInFacets(totalAdd[4], facets) as number][1],
        getSelectors(Test2Facet)
      );
    });

    it("12. Replace and upgrade test1 functions", async () => {
      const Test1Facet = await ethers.getContractFactory("Test1FacetUpgrade");
      const test1FacetUpgrade = await Test1Facet.deploy();
      const selectors = getSelectors(Test1Facet);
      const testFacetAddress = test1FacetUpgrade.address;
      totalAdd.push(test1FacetUpgrade.address);

      const queue = await cutFacet.diamondCut(
        [
          {
            facetAddress: testFacetAddress,
            action: FacetCutAction.ReplaceQueued,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const rcpt = await queue.wait();

      if (!rcpt.status) {
        throw Error(`Diamond upgrade failed: ${queue.hash}`);
      };

      await increase(SECONDS_IN_DAY);

      const tx = await cutFacet.diamondCut(
        [
          {
            facetAddress: testFacetAddress,
            action: FacetCutAction.Replace,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const receipt = await tx.wait();

      if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`);
      };

      const result = await loupeFacet.facetFunctionSelectors(testFacetAddress);
      assert.sameMembers(result, getSelectors(Test1Facet));

      // If the action is Replace, update the function selector mapping for each functionSelectors item to the facetAddress.
      // If any of the functionSelectors had a value equal to facetAddress or the selector was unset, revert instead.
    });

    it("13. Test replaced function after 1 day", async () => {
      const test1Facet = await ethers.getContractAt("Test1Facet", diamond);
      expect(await test1Facet.test1Func1()).to.equals(11);
    });

    it("14. Revert function after replace", async () => {
      const Test1Facet = await ethers.getContractFactory("Test1Facet");
      const selectors = getSelectors(Test1Facet).get([
        "test1Func1()",
        "test1Func2()",
        "test1Func3()",
        "test1Func4()",
        "test1Func5()",
        "test1Func6()",
        "test1Func7()",
        "test1Func8()",
        "test1Func9()",
        "test1Func10()",
      ]);

      const queue = await cutFacet.diamondCut(
        [
          {
            facetAddress: totalAdd[3],
            action: FacetCutAction.RevertQueued,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const rcpt = await queue.wait();

      if (!rcpt.status) {
        throw Error(`Diamond upgrade failed: ${queue.hash}`);
      };

      await increase(SECONDS_IN_DAY);

      const tx = await cutFacet.diamondCut(
        [
          {
            facetAddress: totalAdd[3],
            action: FacetCutAction.Revert,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const receipt = await tx.wait();

      if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`);
      };

      const result = await loupeFacet.facetFunctionSelectors(totalAdd[3]);
      assert.sameMembers(result, getSelectors(Test1Facet));
    });

    it("15. Test reverted function after", async () => {
      const test1Facet = await ethers.getContractAt("Test1Facet", diamond);
      expect(await test1Facet.test1Func1()).to.equals(1);
    });

    it("16. Replace and upgrade test1 functions again", async () => {
      const Test1Facet = await ethers.getContractFactory("Test1FacetUpgrade");
      const test1FacetUpgrade = await Test1Facet.deploy();
      const selectors = getSelectors(Test1Facet);
      const testFacetAddress = test1FacetUpgrade.address;
      totalAdd.push(test1FacetUpgrade.address);

      const queue = await cutFacet.diamondCut(
        [
          {
            facetAddress: testFacetAddress,
            action: FacetCutAction.ReplaceQueued,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const rcpt = await queue.wait();

      if (!rcpt.status) {
        throw Error(`Diamond upgrade failed: ${queue.hash}`);
      };

      await increase(SECONDS_IN_DAY);

      const tx = await cutFacet.diamondCut(
        [
          {
            facetAddress: testFacetAddress,
            action: FacetCutAction.Replace,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      );

      const receipt = await tx.wait();

      if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`);
      };

      const result = await loupeFacet.facetFunctionSelectors(testFacetAddress);
      assert.sameMembers(result, getSelectors(Test1Facet));

      // If the action is Replace, update the function selector mapping for each functionSelectors item to the facetAddress.
      // If any of the functionSelectors had a value equal to facetAddress or the selector was unset, revert instead.
    });

    it("17. Test replaced function after 1 day", async () => {
      const test1Facet = await ethers.getContractAt("Test1Facet", diamond);
      expect(await test1Facet.test1Func1()).to.equals(11);
    });

    it("18.Cannot revert functions after 30 days", async () => {
      // increased to satisfy remove timelock queue and remove function
      const SECONDS_IN_MONTH = 2592000;
      await increase(SECONDS_IN_MONTH);

      const Test1Facet = await ethers.getContractFactory("Test1Facet");
      const selectors = getSelectors(Test1Facet).get([
        "test1Func1()",
        "test1Func2()",
        "test1Func3()",
        "test1Func4()",
        "test1Func5()",
        "test1Func6()",
        "test1Func7()",
        "test1Func8()",
        "test1Func9()",
        "test1Func10()",
      ]);

      await expect(cutFacet.diamondCut(
        [
          {
            facetAddress: totalAdd[3],
            action: FacetCutAction.Revert,
            functionSelectors: selectors,
          },
        ],
        ethers.constants.AddressZero,
        "0x"
      )).to.be.revertedWith("12");

      const Test1FacetUpgrade = await ethers.getContractFactory("Test1FacetUpgrade");

      const result = await loupeFacet.facetFunctionSelectors(totalAdd[6]);
      assert.sameMembers(result, getSelectors(Test1FacetUpgrade));
    });
  });

});
