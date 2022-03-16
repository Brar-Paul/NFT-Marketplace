const { expect } = require("chai");
const { ethers } = require("hardhat");

const toWei = (num) => ethers.utils.parseEther(num.toString())
const fromWei = (num) => ethers.utils.formatEther(num)

describe("NFTMarketplace", function () {
    let deployer, addr1, addr2, nft, marketplace
    let feePercent = 1
    let URI = "Sample URI"
    beforeEach(async function () {
        // Contract Factories / Signers
        const NFT = await ethers.getContractFactory("NFT");
        const Marketplace = await ethers.getContractFactory("Marketplace");
        [deployer, addr1, addr2] = await ethers.getSigners()
        // Deploy
        nft = await NFT.deploy();
        marketplace = await Marketplace.deploy(feePercent);
    });

    describe("Deployment", function () {
        it("Should track name and symbol of collection", async function () {
            expect(await nft.name()).to.equal("Ultras")
            expect(await nft.symbol()).to.equal("ULTRA")
        })
        it("Should track feeAccount and feePercent of marketplace", async function () {
            expect(await marketplace.feeAccount()).to.equal(deployer.address)
            expect(await marketplace.feePercent()).to.equal(feePercent)
        });
    })
    describe("Minting NFTS", function () {
        it("Should trace each minted NFT", async function () {
            // Addr 1
            await nft.connect(addr1).mint(URI)
            expect(await nft.tokenCount()).to.equal(1);
            expect(await nft.balanceOf(addr1.address)).to.equal(1);
            expect(await nft.tokenURI(1)).to.equal(URI);
            // Addr 2
            await nft.connect(addr2).mint(URI)
            expect(await nft.tokenCount()).to.equal(2);
            expect(await nft.balanceOf(addr2.address)).to.equal(1);
            expect(await nft.tokenURI(2)).to.equal(URI);
        })
    })

    describe("Making marketplace items", function () {
        beforeEach(async function () {
            // mint
            await nft.connect(addr1).mint(URI)
            // approve
            await nft.connect(addr1).setApprovalForAll(marketplace.address, true)
        })
        it("Should track newly created item, transfer of NFT to market from seller and emit Offered event", async function () {
            // Offering 1st mint for 1 eth
            await expect(marketplace.connect(addr1).makeItem(nft.address, 1, toWei(1))).to.emit(marketplace, "Offered").withArgs(1, nft.address, 1, toWei(1), addr1.address)
            // Confirm market is owner
            expect(await nft.ownerOf(1)).to.equal(marketplace.address);
            expect(await marketplace.itemCount()).to.equal(1);
            // Confirm mapping
            const item = await marketplace.items(1)
            expect(item.itemId).to.equal(1)
            expect(item.nft).to.equal(nft.address)
            expect(item.tokenId).to.equal(1)
            expect(item.price).to.equal(toWei(1))
            expect(item.sold).to.equal(false)
        });

        it("Should fail if price is set to zero", async function () {
            await expect(marketplace.connect(addr1).makeItem(nft.address, 1, 0)).to.be.revertedWith("Price cannot be zero")
        });
    });

    describe("Purchasing items on market", function () {
        let price = 2
        let fee = (feePercent / 100) * price
        let totalPriceInWei
        beforeEach(async function () {
            await nft.connect(addr1).mint(URI)
            await nft.connect(addr1).setApprovalForAll(marketplace.address, true)
            await marketplace.connect(addr1).makeItem(nft.address, 1, toWei(price))
        })
        it("Should update item to sold, pay seller, transfer to buyer, charge fees, and emit bought event", async function () {
            const sellerInitialEthBal = await addr1.getBalance()
            const feeAccountInitialEthBal = await deployer.getBalance()
            let totalPriceinWei = await marketplace.getTotalPrice(1);
            await expect(marketplace.connect(addr2).purchaseItem(1, { value: totalPriceinWei })).to.emit(marketplace, "Bought").withArgs(
                1,
                nft.address,
                1,
                toWei(price),
                addr1.address,
                addr2.address
            );
            const sellerFinalEthBal = await addr1.getBalance();
            const feeAccountFinalEthBal = await deployer.getBalance();
            expect(+fromWei(sellerFinalEthBal)).to.equal(+price + +fromWei(sellerInitialEthBal))
            const fee = (feePercent / 100) * price;
            expect(+fromWei(feeAccountFinalEthBal)).to.equal(+fee + +fromWei(feeAccountInitialEthBal))
            expect(await nft.ownerOf(1)).to.equal(addr2.address)
            expect((await marketplace.items(1)).sold).to.equal(true)
        });
        it("Should fail for invalid item IDs, sold items, or for insufficient funds", async function () {
            // Invalid ID
            console.log(1)
            await expect(
                marketplace.connect(addr2).purchaseItem(2, { value: totalPriceInWei })
            ).to.be.revertedWith("item doesn't exist");
            console.log(2)
            await expect(
                marketplace.connect(addr2).purchaseItem(0, { value: totalPriceInWei })
            ).to.be.revertedWith("item doesn't exist")
            // Insufficient Funds
            console.log(3)
            await expect(
                marketplace.connect(addr2).purchaseItem(1, { value: toWei(price) })
            ).to.be.revertedWith("not enough ether to cover item price and market fee");
            // Already sold item
            console.log(4)
            await marketplace.connect(addr2).purchaseItem(1, { value: marketplace.getTotalPrice(1) })
            console.log(5)
            await expect(
                marketplace.connect(addr2).purchaseItem(1, { value: marketplace.getTotalPrice(1) })
            ).to.be.revertedWith("item already sold")
        });

    })

})