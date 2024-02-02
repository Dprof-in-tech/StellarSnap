globalThis.Buffer = require('buffer/').Buffer
import { Account, Keypair } from 'stellar-base';
import { Client } from './Client';
import { StateManager, walletAccount, State} from './stateManager';
import {Screens } from './screens';
import Utils from './Utils';
import { panel, text, heading, image, copyable, divider} from '@metamask/snaps-ui';
import QRcode from "qrcode-svg";
import { lookupAddress } from './federation';


export class Wallet{
    keyPair: Keypair;
    address: string;
    publicKey: Buffer;
    seed?: Uint8Array;
    currentState: State;
    walletName: string;
    walletAccount: walletAccount;
    constructor(account:walletAccount, currentState:State){
        this.currentState = currentState;
        this.walletAccount = account;
        this.walletName = account.name;
        if(account.type === "generated"){
            //this.keyPair = nacl.sign.keyPair.fromSeed(seed);
            console.log("seeding");
            const seed = account.seed;
            console.log(seed);
            let bufferSeed = new Uint8Array(32);
            for(let i = 0; i<32; i++){
                bufferSeed[i] = seed[i];
            }
            console.log("about to make keyPair");
            this.keyPair = Keypair.fromRawEd25519Seed(bufferSeed as Buffer);
            console.log(this.keyPair);
            //this.address = StrKey.encodeEd25519PublicKey(this.keyPair.publicKey.buffer);
            this.address = this.keyPair.publicKey();
            //this.publicKey = this.keyPair.publicKey
            this.publicKey = this.keyPair.rawPublicKey();
            console.log(this.publicKey);
        }
        if(account.type === "imported"){
            
            this.keyPair = Keypair.fromSecret(account.privateKey)
            this.address = this.keyPair.publicKey()
            this.publicKey = this.keyPair.rawPublicKey();
        }
    }

    async getKeyPair(): Promise<Keypair>{
        return this.keyPair;
    }
    
    async getBaseAccount(client: Client): Promise<Account>{
        console.log(client);
        const sequence = await client.getSequence(this.address)    
        return new Account(this.address, sequence);
    }
    static fromHexString(hexString){
        return Uint8Array.from(hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)))
    }

    static async createNewAccount(name, currentState?:State, setState?:boolean):Promise<Wallet>{
        if(currentState === undefined){
            currentState = await StateManager.getState();
        }
        if(setState === undefined){
            setState = true;
        }
        const numAccounts = Object.keys(currentState.accounts).length;
        let salt;
        if(numAccounts === 0){
            salt = "foo" //legacy salt before multible accounts
        }
        else{
            salt = "salt "+String(numAccounts+1)
        }
        console.log("salt is: "+salt);
        let tempAccount = await Wallet.getTempAccountFromSalt(salt);
        tempAccount.name = name;
        currentState.accounts[tempAccount.address] = tempAccount;
        if(currentState.currentAccount === null || numAccounts === 0){
            currentState.currentAccount = tempAccount.address;
        }
        if(setState){
            await StateManager.setState(currentState);
        }
        
        return new Wallet(tempAccount, currentState);
    }

    static async renameWallet(address, name, currentState?:State):Promise<boolean>{
        if(!currentState){
            currentState = await StateManager.getState();
        }
        let wallet = currentState.accounts[address];
        if(!wallet){
            Utils.throwError(900, "account not found");
            return false;
        }
        wallet.name = name;
        currentState.accounts[address] = wallet;
        await StateManager.setState(currentState);
        return true;
    }

    static async getCurrentWallet(setState?:boolean):Promise<Wallet>{
        if(setState === undefined){
            setState = true;
        }
        let currentState = await StateManager.getState();
        console.log("got current state");
        console.log(currentState);
        let walletAccount:walletAccount;
        if(currentState.currentAccount === null){
            console.log("current State is null");
            return await Wallet.createNewAccount('Account 1', currentState, setState);
        }
        else{
            console.log("wallet Account found")
            walletAccount = currentState.accounts[currentState.currentAccount]
        }
        return new Wallet(walletAccount, currentState);
        
    }

    static async setCurrentWallet(address:string, currentState?:State, setState?:Boolean){
        if(currentState === undefined){
            currentState = await StateManager.getState();
        }
        if(setState === undefined){
            setState = true;
        }
        if(currentState.accounts[address]){
            currentState.currentAccount = address;
            if(setState){
                await StateManager.setState(currentState);
            }
        }
        else{
            Utils.throwError("404", "account not found");
        }
        return currentState;
    }

    static async getSeedFromSalt(salt){
        const entropy = await snap.request({
            method: 'snap_getEntropy',
            params: {
              version: 1,
              salt: salt, // Optional
            },
        });
        const seed = Wallet.fromHexString(entropy).slice(0, 32)
        return seed
    }

    static async getTempAccountFromSalt(salt):Promise<walletAccount>{
        const seed = await this.getSeedFromSalt(salt);
        let keyPair = Keypair.fromRawEd25519Seed(seed as Buffer);
        //this.address = StrKey.encodeEd25519PublicKey(this.keyPair.publicKey.buffer);
        console.log("seed is");
        console.log(seed);
        const address = keyPair.publicKey();
        const account:walletAccount = {
            address:address,
            name:"temp",
            type:'generated',
            salt:salt,
            seed:seed,
            assets:{
                'mainnet':[],
                'testnet':[]
            }
        }
        return account;
    }

    static async import_account(name:string, privateKey:string, currentState?:State, setState?:Boolean):Promise<State>{
        if(currentState === undefined){
            currentState = await StateManager.getState();
        }
        if(setState === undefined){
            setState = true;
        }
        const keyPair = Keypair.fromSecret(privateKey);
        const address = keyPair.publicKey()
        const account:walletAccount = {
            name:name,
            address: address,
            privateKey:privateKey,
            type:'imported',
            assets:{
                'mainnet':[],
                'testnet':[]
            }
        }
        currentState.accounts[address] = account;
        if(setState){
            await StateManager.setState(currentState);
        }
        return currentState;
    }

    static async listAccounts(currentState?:State){
        console.log("list accounts");
        if(currentState === undefined){
            console.log("currentState is undefined")
            currentState = await StateManager.getState();
            console.log(currentState);
        }
        console.log(currentState.accounts);
        let output:Array<{"name":String, "address":String}> = []
        console.log(currentState.accounts);
        for(let account of Object.values(currentState.accounts)){
            console.log(account);
            output.push({
                name:account.name,
                address:account.address
            })
        }
        console.log("output is");
        console.log(output);
        return output;
    }
      
}




export async function showQrCode(wallet:Wallet){

    const qrcode = new QRcode(wallet.address);
    let svg = qrcode.svg();
    let img = image(svg);
    let fedAddress = (await lookupAddress(wallet.address)).stellar_address
    if(fedAddress === null){
        fedAddress = "no metastellar account";
    }
    let output = panel([
        heading(wallet.walletName),
        text(fedAddress),
        divider(),
        img, 
        copyable(wallet.address)]);
    return await Utils.displayPanel(output, "alert");
}


export async function ImportAccountUI(currentState?:State):Promise<State|void>{
    if(!currentState){
        StateManager.getState();
    }
    const privateKey = await Screens.importAccountPrivateKey() as string;
    let keypair:Keypair;
    try{
        keypair = Keypair.fromSecret(privateKey);
    }
    catch(e){
        await Utils.displayPanel(panel([text("invalid private key")]), "alert");
        return Utils.throwError(400, "invalid private key");
    }
    
    const AccountName = await Screens.importAccountName(keypair.publicKey()) as string;
    return await Wallet.import_account(AccountName, privateKey, currentState, true);

}



