import { getSelectors, FacetCutAction } from "./libraries/diamond";
import { ethers } from "hardhat";

export async function deployBaseDiamond(account: any) {
  let diamond: any;

  // BASE DIAMOND DEPLOY SCRIPT
  // deploy DiamondCutFacet
  const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
  const diamondCutFacet = await DiamondCutFacet.deploy();

  await diamondCutFacet.deployed();
  console.log('DiamondCutFacet deployed:', diamondCutFacet.address);

  // deploy Diamond
  const Diamond = await ethers.getContractFactory("Diamond");
  diamond = await Diamond.deploy(account.address, diamondCutFacet.address);
  await diamond.deployed();
  console.log('Diamond deployed:', diamond.address);

  // DEPLOY ALL OTHER CONTRACTS
  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const DiamondInit = await ethers.getContractFactory("DiamondInit");
  const diamondInit = await DiamondInit.deploy();
  await diamondInit.deployed();
  console.log('DiamondInit deployed:', diamondInit.address);
  
  console.log('')
  console.log('Deploying facets')
  const FacetNames = [
    'DiamondLoupeFacet',
    'OwnershipFacet'
  ];

  // The `queue` variable is the FacetCut[] that contains the functions to queue to add queue during diamond deployment
  const queue = [];
  // The `facetCuts` variable is the FacetCut[] that contains the functions to add during diamond deployment
  const facetCuts = []
  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName)
    const facet = await Facet.deploy()
    await facet.deployed()
    console.log(`${FacetName} deployed: ${facet.address}`);
    queue.push({
      facetAddress: facet.address,
      action: FacetCutAction.AddQueued,
      functionSelectors: getSelectors(facet),
    });

    facetCuts.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet)
    });
  }

  const diamondCut = await ethers.getContractAt("IDiamondCut", diamond.address);
  
  let tx;
  let receipt;

  let functionCall = diamondInit.interface.encodeFunctionData("init");

  tx = await diamondCut.diamondCut(queue, ethers.constants.AddressZero, "0x");
  console.log('Diamond cut queue tx: ', tx.hash);
  receipt = await tx.wait();

  if (!receipt.status) {
    throw Error(`Diamond queue add failed: ${tx.hash}`);
  }

  tx = await diamondCut.diamondCut(facetCuts, diamondInit.address, functionCall);
  console.log('Diamond cut add tx: ', tx.hash);
  receipt = await tx.wait();
  
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }

  console.log('Completed diamond cut');

  let cutFacet = await ethers.getContractAt('DiamondCutFacet', diamond.address)
  let loupeFacet = await ethers.getContractAt('DiamondLoupeFacet', diamond.address)
  let ownershipFacet = await ethers.getContractAt('OwnershipFacet', diamond.address);

  return [diamond.address, {cut: cutFacet, loupe: loupeFacet, owner: ownershipFacet}];
}
