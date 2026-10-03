import { packAccount, CROSS } from '../../src/shared/boros/account';
export const borosRoot='0x1111111111111111111111111111111111111111';
export const borosHandle=packAccount(borosRoot,0,2,CROSS);
export const accountSync={timestamp:1800000000,blockNumber:100};
export const accountAssets={results:[{tokenId:2,symbol:'WETH',usdPrice:'2000',metadata:{}},{tokenId:3,symbol:'USDT',usdPrice:'1',metadata:{}}]};
export const accountBalances={results:[{marketAcc:borosHandle,totalCash:'1000000000000000000',netBalance:'1100000000000000000',initialMargin:'200000000000000000',availableInitialMargin:'900000000000000000',availableMaintMargin:'1000000000000000000',positions:[{marketId:1,liquidationApr:'150000000000000000'}]}],syncStatus:accountSync};
export const accountPositions={results:[{marketAcc:borosHandle,marketId:1,signedSize:'2000000000000000000',side:0,fixedApr:.05,cumulativePnl:'10000000000000000',unrealisedPnl:'20000000000000000',settlementPnl:'30000000000000000',isMatured:false}],syncStatus:accountSync};
export const accountSettlements={results:[{id:'settle1',marketAcc:borosHandle,marketId:1,timestamp:1800000000,settlement:'29000000000000000',fee:'1000000000000000',settlementRate:.07}],syncStatus:accountSync,resumeToken:null};
export const accountTransfers={results:[{transferLogId:'deposit1',root:borosRoot,accountId:0,tokenId:2,blockTimestamp:1800000000,amount:'1000000000000000000',fromFundLocation:{fundType:'wallet'},toFundLocation:{fundType:'cross_account'},status:'success'}],syncStatus:accountSync,resumeToken:null};
