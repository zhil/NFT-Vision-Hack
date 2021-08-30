import React from "react";
import { Button, Input, Tooltip } from "antd";
import { createSellOrder} from "../rarible/createOrders";
const { utils } = require("ethers");

export default function Sell(props) {
  const [sellState, setSellState] = React.useState();
  const [sellForEthValue, setSellForEthValue] = React.useState();
  
 
  const buttons = (
    <Tooltip placement="right" title="* 10 ** 18">
      <div
        type="dashed"
        style={{ cursor: "pointer" }}
        onClick={async () => {
          try {
            setSellForEthValue(utils.parseEther(sellForEthValue));
          } catch {
            console.log("enter a value");
          }
        }}
      >
        ✴️
      </div>
    </Tooltip>
  );
  return (
    <div>
      <Button  style={{marginTop:"10px", marginBottom:"10px"}} onClick={() => setSellState("ETH")}>Sell for ETH</Button>
      {props.cancelButton && <Button  style={{marginTop:"10px", marginBottom:"10px",marginLeft:"10px"}} onClick={async() =>
        
        {await props.cancel(props.item)}
        
        }>Cancel</Button> }

      {(sellState && sellState === "ETH" && (
        <div>
          <Input
            value={sellForEthValue}
            placeholder="ETH"
            onChange={e => {
              setSellForEthValue(e.target.value);
            }}
            suffix={buttons}
          /> 
          <Button
          style={{marginTop:"10px", marginLeft:"10px"}}
            onClick={async () =>{

              // /0x7d47126a2600E22eab9eD6CF0e515678727779A6
              const approved=await props.tx(props.writerContract.approve("0x7d47126a2600E22eab9eD6CF0e515678727779A6", props.tokenId));
              const rec=await approved.wait() 
                if(rec){
                await createSellOrder("MAKE_ERC721_TAKE_ETH", props.provider, {
                  accountAddress: props.accountAddress,
                  makeERC721Address: props.ERC721Address,
                  makeERC721TokenId: props.tokenId,
                  ethAmt: sellForEthValue.toString(),
                })
              }  
                 }
            }
          >
            Create Sell Order
          </Button>
          <Button
           style={{marginTop:"10px", marginLeft:"10px"}}
            onClick={() =>
              setSellState(null)
              //sellState
            }
          >
            Cancel
          </Button>
        </div>
      )) ||
        (sellState === "YERC" && <span>YERC</span>)}
    </div>
  );
}
