let isNode = false;//typeof(module) != undefined;

let API_KEY = '<infura api key>'

let BASE_MAINNET = 'base-mainnet';
let ETHEREUM_SEPOLIA = 'sepolia';
let AERODROME_ROUTER_ADDRESS = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43';

let WETH = '0x4200000000000000000000000000000000000006';
let  ETH = '0x0000000000000000000000000000000000000006';
let USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

let ABIS = {};
let BYTECODES = {};

let PRIVATE_KEY = '<private key>';
let PUBLIC_KEY = "<eth address>";

if(isNode){
    ethers = require('ethers');
    fs = require('fs');
    compiler = require('solc')
}else{
    //TODO: use script tags in HTML to import these
    /*
    <script type="module">
    import { ethers } from "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js";    
    </script>
    <script type="text/javascript" src="https://binaries.soliditylang.org/bin/{{ SOLC VERSION }}.js"
    ></script>
    */
}

async function getTokenPriceFromFund(fundAddress, token){
    let contract = getEtfCcontractInstance('sepolia', fundAddress)
    //price = parseUnits(price, 18);
    let res = await contract.getTokenPrice(token)
    console.log("PRICE FROM FUND", res)
    document.getElementById('token-price-from-fund').innerHTML = res.toString();
}

async function getWethPrice(){
    let aero = getAeodromeCcontractInstance(BASE_MAINNET, AERODROME_ROUTER_ADDRESS) 

    let factoryAddress = await aero.defaultFactory() 

    console.log("FACTORY ADDRESS", factoryAddress);

    let amnounts_out = await aero.getAmountsOut("1000000000000000000", [
        [
            WETH,
            USDC,                        
            false,
            factoryAddress
        ]
    ])

    document.getElementById('tokenprice').innerHTML = '$' + ethers.formatUnits(amnounts_out[1].toString(), 6) ;

    document.getElementById('tokenpriceinput').value = amnounts_out[1].toString();

    //console.log("AMOUNTS OUT", amnounts_out[0], amnounts_out[1])

    return amnounts_out[1];
}

function getFile(contractName){
    if(isNode){
        return fs.readFileSync(contractName)
    }else{
        return document.getElementById(contractName).value;
    }
}

function buildContract(contractName){
    let sourceText = getFile(contractName);

    let sourceCode = {
        language: "Solidity",
        sources: { 
            contract: {
                content: sourceText
            }
        },
        settings: {
            optimizer: {
                enabled: false
            },
            evmVersion: "istanbul",
            outputSelection: {
                "*": {
                "": [
                    "legacyAST",
                    "ast"
                ],
                "*": [
                    "abi",
                    "evm.bytecode.object",
                    "evm.bytecode.sourceMap",
                    "evm.deployedBytecode.object",
                    "evm.deployedBytecode.sourceMap",
                    "evm.gasEstimates"
                ]
                },
            }
        }
    };

    // Compiling the contract
    let result = compiler.compile(JSON.stringify(sourceCode), 1);

    return result;
}

function getProvider(url){
    provider = new ethers.JsonRpcProvider(url)
    return provider
}

function getProviderForNetwork(network){
    return getProvider("https://" + network + ".infura.io/v3/" + API_KEY)
}

function getContract(provider, abi, address, signer){
    contract = new ethers.Contract(address, abi, signer || provider)
    return contract;
}

///////////////////////////////////////////////////////////////
function getEtfCcontractInstance(network, address){
    let provider = getProviderForNetwork(network);
    let abi = ABIS['ETFToken'];
    const signer = new ethers.Wallet(PRIVATE_KEY,  provider);
    return getContract(provider, abi, address, signer)
}

function getTokenContractInstance(network, address){
    let provider = getProviderForNetwork(network);
    let abi = ABIS['MyToken'];
    const signer = new ethers.Wallet(PRIVATE_KEY,  provider);
    return getContract(provider, abi, address, signer)
}

function getAeodromeCcontractInstance(network, address){
    let provider = getProviderForNetwork(network);
    let abi = ABIS['Aerodrome'];    
    const signer = new ethers.Wallet(PRIVATE_KEY,  provider);
    return getContract(provider, abi, address, signer)
}

///////////////////////////////////////////////////////////////

async function deploy(args, provider, abi, bytecode, privateKey) {
    console.log("ABI", abi, "BYTECODE", bytecode);

    const signer = new ethers.Wallet(privateKey, provider);
    const factory = new ethers.ContractFactory(abi, bytecode, signer)
  
    const contract = await factory.deploy(...args)
  
    console.log("contract", contract, await contract.getAddress());

    // The contract is NOT deployed yet; we must wait until it is mined
    //await contract.deployed()
    return contract
}

async function deployTestToken(
    symbol, name, decimals=18, initialSupply=10000000,
    callback_inputs
){
    let contractName = 'MyToken'
    let result = null;
    try {
        result = await deploy(
            [
                name, symbol, decimals, initialSupply                
            ],
            getProviderForNetwork('sepolia'),
            ABIS[contractName],
            BYTECODES[contractName],
            PRIVATE_KEY
        )
        //console.log(`address: ${result.address}`)
        if(callback_inputs){
            let addr = await result.getAddress();
            for(var i in callback_inputs){
                document.getElementById(callback_inputs[i]).value = addr;
            }
        }
    } catch (e) {
        console.log(e.message)
    }
    return result;
}

async function deployFundToken(
    symbol, name, initialSupply, 
    stablecoinAddress, seedAmount, 
    useOracle, aerodromeAddress
){
    let contractName = 'ETFToken'
    let result = null;
   
    try {
        result = await deploy( 
            [
                symbol, name, initialSupply,
                stablecoinAddress, seedAmount,
                useOracle, aerodromeAddress
            ],
            getProviderForNetwork('sepolia'),
            ABIS[contractName],
            BYTECODES[contractName],
            PRIVATE_KEY
        )
    } catch (e) {
        console.log(e.message)
    }

    document.getElementById('fund-token-address').value = await result.getAddress();

    return result
}

async function setTokenPrice(token, price, fundAddress){
    let contract = getEtfCcontractInstance('sepolia', fundAddress)
    //price = parseUnits(price, 18);
    console.log("setTokenPrice()");
    let tx = await contract.setOraclePrice(token, price)
    return await tx.wait()
}

async function mint(stableAmountDeposited, fundAddress){
    let contract = getEtfCcontractInstance('sepolia', fundAddress)
    //amount = parseUnits(stableAmountDeposited, 18);
    console.log("mint()");
    let tx = await contract.mint(stableAmountDeposited)
    return await tx.wait()
}

async function burn(amount, fundAddress){
    let contract = getEtfCcontractInstance('sepolia', fundAddress)
    //amount = parseUnits(amount, 18);
    console.log("burn()");
    let tx = await contract.burn(amount)
    return await tx.wait()
}

async function burnWithoutLiquidate(amount, fundAddress){
    let contract = getEtfCcontractInstance('sepolia', fundAddress)
    //amount = parseUnits(amount, 18);
    console.log("burnWithoutLiquidate()");
    let tx = await contract.burnWithoutLiquidate(amount)
    return await tx.wait()
}

async function trade(tokenFrom, amtFrom, tokenTo, amtTo, fundAddress){
    let contract = getEtfCcontractInstance('sepolia', fundAddress)
    //amtFrom = parseUnits(amtFrom, 18);
    //amtTo = parseUnits(amtTo, 18);
    console.log("trade()");
    let tx = await contract.trade(tokenFrom, amtFrom, tokenTo, amtTo)
    return await tx.wait()
}

async function whitelist(token, fundAddress){
    let contract = getEtfCcontractInstance('sepolia', fundAddress)
    //amtFrom = parseUnits(amtFrom, 18);
    //amtTo = parseUnits(amtTo, 18);
    console.log("whitelist()");
    let tx = await contract.whitelist(token)
    return await tx.wait()
}

async function approveToken(to, amount, address){
    let contract = getTokenContractInstance('sepolia', address);
    let tx = await contract.approve(to, amount);
    console.log("approveToken()");
    return await tx.wait();
}

async function transferToken(to, amount, address){
    let contract = getTokenContractInstance('sepolia', address);
    let tx = await contract.transfer(to, amount);
    console.log("transferToken()");
    return await tx.wait();
}

async function balanceOfToken(token, owner, callback_inputs){
    let contract = getTokenContractInstance('sepolia', token);
    let result = await contract.balanceOf(owner);

    console.log("balanceOfToken()");

    if(callback_inputs){        
        for(var i in callback_inputs){
            document.getElementById(callback_inputs[i]).value = result;
        }
    }

    return result;
}

if(isNode){
    module.exports = {
        getTokenPriceFromFund,
        getWethPrice,

        buildContract,
        deployTestToken,
        deployFundToken,
        
        setTokenPrice,

        mint,
        burn,
        burnWithoutLiquidate,

        trade,

        approveToken,
        transferToken,
        balanceOfToken,
    }
}
