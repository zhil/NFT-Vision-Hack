import { StaticJsonRpcProvider, Web3Provider } from "@ethersproject/providers";
import { formatEther, parseEther } from "@ethersproject/units";
import { BigNumber } from "@ethersproject/bignumber";
import WalletConnectProvider from "@walletconnect/web3-provider";
import { Alert, Button, Card, Col, Input, List, Menu, Row } from "antd";
import "antd/dist/antd.css";
import { useUserAddress } from "eth-hooks";
import React, { useCallback, useEffect, useState } from "react";
import ReactJson from "react-json-view";
import { BrowserRouter, Link, Route, Switch } from "react-router-dom";
import Web3Modal from "web3modal";
import "./App.css";

import {
  Account,
  Address,
  AddressInput,
  Contract,
  Faucet,
  GasGauge,
  Header,
  Ramp,
  ThemeSwitch,
  Sell,
  Mint,
  LazyMint,
  RaribleItemIndexer,
} from "./components";
import { DAI_ABI, DAI_ADDRESS, INFURA_ID, NETWORK, NETWORKS } from "./constants";
import { Transactor } from "./helpers";
import {
  useBalance,
  useContractLoader,
  useContractReader,
  useEventListener,
  useExchangePrice,
  useExternalContractLoader,
  useGasPrice,
  useOnBlock,
  useUserProvider,
} from "./hooks";
import { matchSellOrder, prepareMatchingOrder,prepareOrderMessage } from "./rarible/createOrders";
const BN =require('bn.js');
const { BufferList } = require("bl");
// https://www.npmjs.com/package/ipfs-http-client
const ipfsAPI = require("ipfs-http-client");

const ipfs = ipfsAPI({ host: "ipfs.infura.io", port: "5001", protocol: "https" });
/*
    Welcome to 🏗 scaffold-eth !

    Code:
    https://github.com/austintgriffith/scaffold-eth

    Support:
    https://t.me/joinchat/KByvmRe5wkR-8F_zz6AjpA
    or DM @austingriffith on twitter or telegram

    You should get your own Infura.io ID and put it in `constants.js`
    (this is your connection to the main Ethereum network for ENS etc.)


    🌏 EXTERNAL CONTRACTS:
    You can also bring in contract artifacts in `constants.js`
    (and then use the `useExternalContractLoader()` hook!)
*/

/// 📡 What chain are your contracts deployed to?
const targetNetwork = NETWORKS.rinkeby; // <------- select your target frontend network (localhost, rinkeby, xdai, mainnet)

// 😬 Sorry for all the console logging
const DEBUG = true;

// EXAMPLE STARTING JSON:
const STARTING_JSON = {
  description: "It's actually a bison?",
  external_url: "https://austingriffith.com/portfolio/paintings/", // <-- this can link to a page for the specific file too
  image: "https://austingriffith.com/images/paintings/buffalo.jpg",
  name: "Buffalo",
  attributes: [
    {
      trait_type: "BackgroundColor",
      value: "green",
    },
    {
      trait_type: "Eyes",
      value: "googly",
    },
  ],
};

// helper function to "Get" from IPFS
// you usually go content.toString() after this...
const getFromIPFS = async hashToGet => {
  for await (const file of ipfs.get(hashToGet)) {
    //console.log(file.path);
    if (!file.content) continue;
    const content = new BufferList();
    for await (const chunk of file.content) {
      content.append(chunk);
    }
    //console.log(content);
    return content;
  }
};

// 🛰 providers
if (DEBUG) console.log("📡 Connecting to Mainnet Ethereum");
// const mainnetProvider = getDefaultProvider("mainnet", { infura: INFURA_ID, etherscan: ETHERSCAN_KEY, quorum: 1 });
// const mainnetProvider = new InfuraProvider("mainnet",INFURA_ID);
//
// attempt to connect to our own scaffold eth rpc and if that fails fall back to infura...
// Using StaticJsonRpcProvider as the chainId won't change see https://github.com/ethers-io/ethers.js/issues/901
//const scaffoldEthProvider = new StaticJsonRpcProvider("https://rpc.scaffoldeth.io:48544");
const mainnetInfura = new StaticJsonRpcProvider("https://mainnet.infura.io/v3/" + INFURA_ID);
// ( ⚠️ Getting "failed to meet quorum" errors? Check your INFURA_I

// 🏠 Your local provider is usually pointed at your local blockchain
const localProviderUrl = targetNetwork.rpcUrl;
// as you deploy to other networks you can set REACT_APP_PROVIDER=https://dai.poa.network in packages/react-app/.env
const localProviderUrlFromEnv = process.env.REACT_APP_PROVIDER ? process.env.REACT_APP_PROVIDER : localProviderUrl;
if (DEBUG) console.log("🏠 Connecting to provider:", localProviderUrlFromEnv);
const localProvider = new StaticJsonRpcProvider(localProviderUrlFromEnv);

// 🔭 block explorer URL
const blockExplorer = targetNetwork.blockExplorer;

/*
  Web3 modal helps us "connect" external wallets:
*/
const web3Modal = new Web3Modal({
  // network: "mainnet", // optional
  cacheProvider: true, // optional
  providerOptions: {
    walletconnect: {
      package: WalletConnectProvider, // required
      options: {
        infuraId: INFURA_ID,
      },
    },
  },
});

const logoutOfWeb3Modal = async () => {
  await web3Modal.clearCachedProvider();
  setTimeout(() => {
    window.location.reload();
  }, 1);
};

function App(props) {
  //const mainnetProvider = scaffoldEthProvider && scaffoldEthProvider._network ? scaffoldEthProvider : mainnetInfura;
  const mainnetProvider =  mainnetInfura;
  const [injectedProvider, setInjectedProvider] = useState();
  /* 💵 This hook will get the price of ETH from 🦄 Uniswap: */
  //const price = useExchangePrice(targetNetwork, mainnetProvider);

  /* 🔥 This hook will get the price of Gas from ⛽️ EtherGasStation */
  const gasPrice = useGasPrice(targetNetwork, "fast");
  // Use your injected provider from 🦊 Metamask or if you don't have it then instantly generate a 🔥 burner wallet.
  const userProvider = useUserProvider(injectedProvider, localProvider);
  const address = useUserAddress(userProvider);

  // You can warn the user if you would like them to be on a specific network
  const localChainId = localProvider && localProvider._network && localProvider._network.chainId;
  const selectedChainId = userProvider && userProvider._network && userProvider._network.chainId;

  // For more hooks, check out 🔗eth-hooks at: https://www.npmjs.com/package/eth-hooks

  // The transactor wraps transactions and provides notificiations
  const tx = Transactor(userProvider, gasPrice);

  // Faucet Tx can be used to send funds from the faucet
  const faucetTx = Transactor(localProvider, gasPrice);

  // 🏗 scaffold-eth is full of handy hooks like this one to get your balance:
  const yourLocalBalance = useBalance(localProvider, address);

  // Just plug in different 🛰 providers to get your balance on different chains:
  //const yourMainnetBalance = useBalance(mainnetProvider, address);

  // Load in your local 📝 contract and read a value from it:
  const readContracts = useContractLoader(userProvider);

  // If you want to make 🔐 write transactions to your contracts, use the userProvider:
  const writeContracts = useContractLoader(userProvider);

  // EXTERNAL CONTRACT EXAMPLE:
  //
  // If you want to bring in the mainnet DAI contract it would look like:
  const mainnetDAIContract = useExternalContractLoader(mainnetProvider, DAI_ADDRESS, DAI_ABI);

  // If you want to call a function on a new block
/*   useOnBlock(mainnetProvider, () => {
    //console.log(`⛓ A new mainnet block is here: ${mainnetProvider._lastBlockNumber}`);
  }); */

  // Then read your DAI balance like:
  const myMainnetDAIBalance = useContractReader({ DAI: mainnetDAIContract }, "DAI", "balanceOf", [
    "0x34aA3F359A9D614239015126635CE7732c18fDF3",
  ]);

  // keep track of a variable from the contract in the local React state:
  const balance = useContractReader(readContracts, "YourCollectible", "balanceOf", [address]);
  //console.log("🤗 balance:", balance);
  // 📟 Listen for broadcast events
  const transferEvents = useEventListener(readContracts, "YourCollectible", "Transfer", localProvider, 1);
  //console.log("📟 Transfer events:", transferEvents);

  //
  // 🧠 This effect will update yourCollectibles by polling when your balance changes
  //
  const yourBalance = balance && balance.toNumber && balance.toNumber();
  const [yourCollectibles, setYourCollectibles] = useState();
  const [collectionOrders, setCollectionOrders] = useState();
  const [boardPosition, setBoardPosition] = useState("8/8/8/8/8/8/8/8");
  const [positionLabel, setPositionLabel] = useState("");
  let Board=null
  const [config,setConfig]=useState(  {
    draggable: true,
   
    onDrop:onDrop,
    showNotation: true,
    position: "",
    orientation: 'white',
    showNotation: false,
    draggable: true,
    dropOffBoard: 'trash',
    sparePieces: true
    /*  onDragStart: this.onDragStart,
    onDrop: this.onDrop,
    onSnapEnd: this.onSnapEnd */
    }) 

  const [downloading, setDownloading] = useState();

  const [positionDNA, setpositionDNA] = useState(0);
  const [board,setBoard]=useState();
  const cancel=async(item)=>{

    const prepared=await prepareOrderMessage({ 


                             
      type: item.type,
      maker: item.maker,
      make: item.make ,
      take:item.take, 
      data:item.data,
      salt:parseInt(item.salt),
     

  }) 
  
  tx(writeContracts.ExchangeV2.cancel(prepared.struct,{from:address}))
  }
  function onDrop (source, target, piece, newPos, oldPos, orientation) {
  
    setBoardPosition(window.Chessboard.objToFen(newPos))
  }
  useEffect(()=>{
    if (window.ChessBoard !== null) {
    
    //board= window.ChessBoard("board", config)
    Board=window.ChessBoard("board", config)
     setBoard( Board)
    //console.log(board)
    
    }
    },[ ])
  const createNFT = async () => {
    const SQUARES = {
      a8:   0, b8:   1, c8:   2, d8:   3, e8:   4, f8:   5, g8:   6, h8:   7,
      a7:   8, b7:   9, c7:  10, d7:  11, e7:  12, f7:  13, g7:  14, h7:  15,
      a6:  16, b6:  17, c6:  18, d6:  19, e6:  20, f6:  21, g6:  22, h6:  23,
      a5:  24, b5:  25, c5:  26, d5:  27, e5:  28, f5:  29, g5:  30, h5:  31,
      a4:  32, b4:  33, c4:  34, d4:  35, e4:  36, f4:  37, g4:  38, h4:  39,
      a3:  40, b3:  41, c3:  42, d3:  43, e3:  44, f3:  45, g3:  46, h3:  47,
      a2:  48, b2:  49, c2:  50, d2:  51, e2:  52, f2:  53, g2:  54, h2:  55,
      a1:  56, b1:  57, c1:  58, d1:  59, e1:  60, f1:  61, g1:  62, h1:  63
    };
    const PIECES={
      wP:0x1,
      wN:0x2,
      wB:0x3,
      wR:0x4,
      wQ:0x5,
      wK:0x6,
      bP:0x9,
      bN:0xa,
      bB:0xb,
      bR:0xc,
      bQ:0xd,
      bK:0xe,
    }
     
    let bits=new BN(0,16)
 
    // bits=bits | BigInt(position[8]) << BigInt(4*8)    |  BigInt(position[0]) << BigInt(4*0)    | BigInt(position[3]) << BigInt(4*3)  
    
     const _position=Object.entries(board.position())  // Object.entries(window.Chessboard.fenToObj(boardPosition))
     
     let piece =0
     const ethValue= "0.05"
    // console.log(description)
     if(  positionLabel.trim()=="" ){
      
       return
     }
      
     if(!_position || _position.length==0 ){
      console.log("empty",piece)
     // setpositionDNA(piece)
      //positionDNA=0 
     }else{
      _position.forEach(square=>{
        console.log(PIECES[square[1]])
        
        bits=bits.or( new BN(PIECES[square[1]],16).shln(4*SQUARES[square[0]]) )   
         
      })
      piece=bits.toString()
     
     }

     tx(writeContracts.YourCollectible.buyToken(piece,positionLabel,{value:"50000000000000000"}));
   //   await purchase(piece,positionLabel ,ethValue);
 
   // console.log(piece)
   //  setpositionDNA(piece)
   
     
     /*  if (!_rejected) {
         
      } else if (_rejected) {
        setprogressState("preview");
      } */

   
  };
  //let board=null  
   
  useEffect(() => {
    const updateYourCollectibles = async () => {
      const collectibleUpdate = [];
       let sellOrdersUpdate = [];
     // console.log("elbaruni",balance)
     setDownloading(true);
     const collectionContract="0x0FAa54C764F125F9799a0062b7df062C502875F2"
      const getSellOrderByCollectionUrl = `https://api-staging.rarible.com/protocol/v0.1/ethereum/order/orders/sell/byCollection?collection=${collectionContract}&sort=LAST_UPDATE`;
      const sellOrderResult = await fetch(getSellOrderByCollectionUrl);
      
      const resultJson = await sellOrderResult.json();
      if (resultJson && resultJson.orders) {
        sellOrdersUpdate=resultJson.orders;
        
      }
 
      for (let tokenIndex = 0; tokenIndex < balance ; tokenIndex++) {
        try {
          let cancel=false;
        //  console.log("GEtting token index", tokenIndex);
          const tokenId = await readContracts.YourCollectible.tokenOfOwnerByIndex(address, tokenIndex);
        //  console.log("tokenId", tokenId);
          const tokenURI = await readContracts.YourCollectible.tokenURI(tokenId);
         const jsonManifestBuffer =atob(tokenURI.split(",")[1]); //await getFromIPFS(ipfsHash);
          let index=sellOrdersUpdate.filter(c => c.maker==address.toLocaleLowerCase()).map(el=>el.make.assetType.tokenId).indexOf(tokenId.toString()) 
          cancel=index>=0;

          

          
        //   console.log("elbaruni",jsonManifestBuffer)

          try {
            const jsonManifest = JSON.parse(jsonManifestBuffer.toString());
        //    console.log("jsonManifest", jsonManifest);
            collectibleUpdate.push({ id: tokenId, uri: tokenURI,cancel:cancel,order:cancel ? sellOrdersUpdate[index]:[], owner: address, ...jsonManifest });
          } catch (e) {
            console.log(e);
          }
        } catch (e) {
          console.log(e);
        }
      }

    
    
      for(let i=0;i<sellOrdersUpdate.length;i++){
        try{
        const order=sellOrdersUpdate[i];
        const tokenURI = await readContracts.YourCollectible.tokenURI(order.make.assetType.tokenId);
        const jsonManifestBuffer =atob(tokenURI.split(",")[1]); //await getFromIPFS(ipfsHash);
        const jsonManifest = JSON.parse(jsonManifestBuffer.toString());
        sellOrdersUpdate[i]={...order,image:jsonManifest.image,name:jsonManifest.name}
      }
        catch(e){
          
        }
      }
       
      setYourCollectibles(collectibleUpdate);
      setCollectionOrders(resultJson.orders);
    };
/*     const updateOrders=async ()=>{
      setDownloading(true);
       
      const collectionContract="0x0FAa54C764F125F9799a0062b7df062C502875F2"
      const getSellOrderByCollectionUrl = `https://api-staging.rarible.com/protocol/v0.1/ethereum/order/orders/sell/byCollection?collection=${collectionContract}&sort=LAST_UPDATE`;
      const sellOrderResult = await fetch(getSellOrderByCollectionUrl);
     
      const resultJson = await sellOrderResult.json();
      if (resultJson && resultJson.orders) {
        setCollectionOrders(resultJson.orders);
      }
      setDownloading(false);
      //https://api-staging.rarible.com/protocol/v0.1/ethereum/order/orders/sell/byCollection?collection=0xcfa14f6DC737b8f9e0fC39f05Bf3d903aC5D4575&sort=LAST_UPDATE
       
      //
    console.log(resultJson.orders)
    } */
    updateYourCollectibles();
   // updateOrders()
  }, [address, yourBalance]);

  /*
  const addressFromENS = useResolveName(mainnetProvider, "austingriffith.eth");
  console.log("🏷 Resolved austingriffith.eth as:",addressFromENS)
  */

  //
  // 🧫 DEBUG 👨🏻‍🔬
  //
  useEffect(() => {
    if (
      DEBUG &&
     // mainnetProvider &&
      address &&
      selectedChainId &&
     // yourLocalBalance &&
     // yourMainnetBalance &&
      readContracts &&
      writeContracts &&
      mainnetDAIContract
    ) {
/*       console.log("_____________________________________ 🏗 scaffold-eth _____________________________________");
      console.log("🌎 mainnetProvider", mainnetProvider);
      console.log("🏠 localChainId", localChainId);
      console.log("👩‍💼 selected address:", address);
      console.log("🕵🏻‍♂️ selectedChainId:", selectedChainId);
      console.log("💵 yourLocalBalance", yourLocalBalance ? formatEther(yourLocalBalance) : "...");
      console.log("💵 yourMainnetBalance", yourMainnetBalance ? formatEther(yourMainnetBalance) : "...");
      console.log("📝 readContracts", readContracts);
      console.log("🌍 DAI contract on mainnet:", mainnetDAIContract);
      console.log("🔐 writeContracts", writeContracts); */
    }
  }, [
    //mainnetProvider,
    address,
    selectedChainId,
    yourLocalBalance,
    //yourMainnetBalance,
    readContracts,
    writeContracts,
    mainnetDAIContract,
  ]);

  let networkDisplay = "";
  if (localChainId && selectedChainId && localChainId !== selectedChainId) {
    const networkSelected = NETWORK(selectedChainId);
    const networkLocal = NETWORK(localChainId);
    if (selectedChainId === 1337 && localChainId === 31337) {
      networkDisplay = (
        <div style={{ zIndex: 2, position: "absolute", right: 0, top: 60, padding: 16 }}>
          <Alert
            message="⚠️ Wrong Network ID"
            description={
              <div>
                You have <b>chain id 1337</b> for localhost and you need to change it to <b>31337</b> to work with
                HardHat.
                <div>(MetaMask -&gt; Settings -&gt; Networks -&gt; Chain ID -&gt; 31337)</div>
              </div>
            }
            type="error"
            closable={false}
          />
        </div>
      );
    } else {
      networkDisplay = (
        <div style={{ zIndex: 2, position: "absolute", right: 0, top: 60, padding: 16 }}>
          <Alert
            message="⚠️ Wrong Network"
            description={
              <div>
                You have <b>{networkSelected && networkSelected.name}</b> selected and you need to be on{" "}
                <b>{networkLocal && networkLocal.name}</b>.
              </div>
            }
            type="error"
            closable={false}
          />
        </div>
      );
    }
  } else {
    networkDisplay = (
      <div style={{ zIndex: -1, position: "absolute", right: 154, top: 28, padding: 16, color: targetNetwork.color }}>
        {targetNetwork.name}
      </div>
    );
  }

  const loadWeb3Modal = useCallback(async () => {
    const provider = await web3Modal.connect();
    setInjectedProvider(new Web3Provider(provider));
  }, [setInjectedProvider]);

  useEffect(() => {
    if (web3Modal.cachedProvider) {
      loadWeb3Modal();
    }
  }, [loadWeb3Modal]);

  const [route, setRoute] = useState();
  useEffect(() => {
    setRoute(window.location.pathname);
  }, [setRoute]);

 
   


     return (
    <div className="App">
      {/* ✏️ Edit the header and change the title to your project name */}
      <Header />
      {networkDisplay}
      <BrowserRouter>
        <Menu style={{ textAlign: "center" }} selectedKeys={[route]} mode="horizontal">
          <Menu.Item key="/">
            <Link
              onClick={() => {
               
                setRoute("/");
              }}
              to="/"
            >
              Mint new Chess position
            </Link>
          </Menu.Item>
           
          <Menu.Item key="/mycollection">
            <Link
              onClick={() => {
                setRoute("/mycollection");
              }}
              to="/mycollection"
            >
              Your My Favroite Chess
            </Link>
          </Menu.Item>
           
          
          <Menu.Item key="/rarible">
            <Link
              onClick={() => {
                setRoute("/rarible");
              }}
              to="/rarible"
            >
             Buy My Favroite Chess
            </Link>
          </Menu.Item>
           
        </Menu>

        <Switch>
          <Route exact path="/">
            {/*
                🎛 this scaffolding is full of commonly used components
                this <Contract/> component will automatically parse your ABI
                and give you a form to interact with it locally
            */}
<div style={{ width: "100%", margin: "auto", marginTop: 32, paddingBottom: 32 ,height:"100%" }}>
<div id="board" style={{ width: "300px" ,height:"70%"}}>
              
                                        
                
                   
                     
                      
                 
              
              </div>
             <Input
             style={{width:"400px",marginRight:"10px"}}
            value={positionLabel}
            placeholder="Your position Label"
            onChange={e => {
              setPositionLabel(e.target.value);
            }} >
              </Input>
              <Button onClick={createNFT} >
                Mint Position
              </Button>
              </div>
          </Route>
          <Route  path="/mycollection">
            {/*
                🎛 this scaffolding is full of commonly used components
                this <Contract/> component will automatically parse your ABI
                and give you a form to interact with it locally
            */}

            <div style={{ width: "100%", margin: "auto", marginTop: 32, paddingBottom: 32 }}>
            <Row gutter={16}>
              {yourCollectibles && yourCollectibles.map(item=>{
                console.log(item)
              const id = item.id.toNumber();
                return (
                  <Col className="gutter-row" span={8} key={id + "_" + item.uri + "_" + item.owner}>
                                        
                                        <Card
                        style={{ width: "100%" }}
                        title={
                          <div>
                            <span style={{ fontSize: 16, marginRight: 8 }}>#{id}</span> {item.name}
                          </div>
                        }
                      ><div style={{marginBottom:"10px"}}>{item.description}</div>
                        <div>
                          <img src={item.image} style={{  maxWidth: "300px" }} />
                        </div>
                        
                         
                         
                        <Sell 
                          tx={tx}
                          writerContract={writeContracts.YourCollectible}                           
                          provider={userProvider}
                          accountAddress={address}
                          ERC721Address={writeContracts.YourCollectible.address}
                          tokenId={id}
                          cancelButton={item.cancel}
                          cancel={cancel}
                          item={item.order}
                        ></Sell>
                      
                        
                      </Card>

                    
       
      </Col>
                )
              })}
              </Row>
              
            </div>
          </Route>

          <Route path="/rarible">
          <div style={{ width: "100%", margin: "auto", marginTop: 32, paddingBottom: 32 }}>
            <Row gutter={16}>
              {collectionOrders && collectionOrders.map(item=>{
                
                const id = item.hash;
                return (
                  <Col className="gutter-row" span={8} key={id}>
                                        
                                        <Card
                        style={{ width: "100%" }}
                        title={
                          <div>
                            <span style={{ fontSize: 16, marginRight: 8 }}>#{item.make.assetType.tokenId}</span> {item.name}
                          </div>
                        }
                      ><div style={{marginBottom:"10px"}}>{item.description}</div>
                        <div>
                          <img src={item.image} style={{  maxWidth: "300px" }} />
                        </div>
                        
                         
                        <div>
                          <p>owner: {item.maker}</p>                   
                                              
                          <p>
                          createAt: {new Date(item.createdAt).toLocaleString('en-US')} price: {formatEther(item.take.value)}
                            {item.take.assetType.assetClass}
                          </p>
                           
                        </div>
                      
                        
                      </Card>
                   <Button style={{marginRight:"10px",marginTop:"10px"}}
                        onClick={async () =>{
                          const preparedTransaction = await prepareMatchingOrder(item, address)
                         //console.log({preparedTransaction})
                          const value = preparedTransaction.asset.value
                          const valueBN = BigNumber.from(value)
                          const safeValue = valueBN.add(100)
                          //console.log({safeValue})
                          const signer = userProvider.getSigner()
                          tx(signer.sendTransaction({to: preparedTransaction.transaction.to, from: address, data: preparedTransaction.transaction.data, value: safeValue}))
                        
                        }
                        }
                      >
                        Fill order
                      </Button>
                      
                      {item.maker.toLowerCase() ==  address.toLowerCase()  && (<Button
                      style={{marginRight:"10px",marginTop:"10px"}}
                        onClick={async () =>{
                          await cancel(item)
                        }
                        }
                      >
                        Cancel order
                      </Button>)}

                    
       
      </Col>
                )
              })}
              </Row>
              
            </div>
         
         <div style={{ width: "100%", margin: "auto", marginTop: 32, paddingBottom: 32 }}>
              <List
                bordered
                dataSource={collectionOrders}
                renderItem={  item => {
                  const id = item.hash;
                  
                  return (
                    <List.Item key={id}>
                     
                    </List.Item>
                  );
                }}
              />
            </div>
          </Route>

     
        </Switch>
      </BrowserRouter>

      <ThemeSwitch />

      {/* 👨‍💼 Your account is in the top right with a wallet at connect options */}
      <div style={{ position: "fixed", textAlign: "right", right: 0, top: 0, padding: 10 }}>
        <Account
          address={address}
          localProvider={localProvider}
          userProvider={userProvider}
         // mainnetProvider={mainnetProvider}
         // price={price}
          web3Modal={web3Modal}
          loadWeb3Modal={loadWeb3Modal}
          logoutOfWeb3Modal={logoutOfWeb3Modal}
          blockExplorer={blockExplorer}
        />
        
      </div>

      {/* 🗺 Extra UI like gas price, eth price, faucet, and support: */}
       
    </div>
  );
}

/* eslint-disable */
window.ethereum &&
  window.ethereum.on("chainChanged", chainId => {
    web3Modal.cachedProvider &&
      setTimeout(() => {
        window.location.reload();
      }, 1);
  });

window.ethereum &&
  window.ethereum.on("accountsChanged", accounts => {
    web3Modal.cachedProvider &&
      setTimeout(() => {
        window.location.reload();
      }, 1);
  });
/* eslint-enable */

export default App;
