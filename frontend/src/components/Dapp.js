import React from "react";

// We'll use ethers to interact with the Ethereum network and our contract
import { ethers } from "ethers";

// We import the contract's artifacts and address here, as we are going to be
// using them with ethers
import GreeterArtifact from "../contracts/Greeter.json";
import contractAddress from "../contracts/contract-address.json";

// All the logic of this dapp is contained in the Dapp component.
// These other components are just presentational ones: they don't have any
// logic. They just render HTML.
import { NoWalletDetected } from "./NoWalletDetected";
import { ConnectWallet } from "./ConnectWallet";
import { Loading } from "./Loading";
// import { Transfer } from "./Transfer";
// import { TransactionErrorMessage } from "./TransactionErrorMessage";
// import { WaitingForTransactionMessage } from "./WaitingForTransactionMessage";
// import { NoTokensMessage } from "./NoTokensMessage";

// This is the Hardhat Network id, you might change it in the hardhat.config.js
// Here's a list of network ids https://docs.metamask.io/guide/ethereum-provider.html#properties
// to use when deploying to other networks.
const HARDHAT_NETWORK_ID = '31337';

// This is an error code that indicates that the user canceled a transaction
// const ERROR_CODE_TX_REJECTED_BY_USER = 4001;

// This component is in charge of doing these things:
//   1. It connects to the user's wallet
//   2. Initializes ethers and the Token contract
//   3. Polls the user balance to keep it updated.
//   4. Transfers tokens by sending transactions
//   5. Renders the whole application
//
// Note that (3) and (4) are specific of this sample application, but they show
// you how to keep your Dapp and contract's state in sync,  and how to send a
// transaction.
export class Dapp extends React.Component {
  constructor(props) {
    super(props);

    // We store multiple things in Dapp's state.
    // You don't need to follow this pattern, but it's an useful example.
    this.initialState = {
      // The info of the token (i.e. It's Name and symbol)
      tokenData: undefined,
      // The user's address and balance
      selectedAddress: undefined,
      balance: undefined,
      // The ID about transactions being sent, and any possible error with them
      txBeingSent: undefined,
      transactionError: undefined,
      networkError: undefined,
    };

    this.state = this.initialState;
  }

  render() {
    // Ethereum wallets inject the window.ethereum object. If it hasn't been
    // injected, we instruct the user to install MetaMask.
    if (window.ethereum === undefined) {
      return <NoWalletDetected />;
    }

    // The next thing we need to do, is to ask the user to connect their wallet.
    // When the wallet gets connected, we are going to save the users's address
    // in the component's state. So, if it hasn't been saved yet, we have
    // to show the ConnectWallet component.
    //
    // Note that we pass it a callback that is going to be called when the user
    // clicks a button. This callback just calls the _connectWallet method.
    if (!this.state.selectedAddress) {
      return (
        <ConnectWallet
          connectWallet={() => this._connectWallet()}
          networkError={this.state.networkError}
          dismiss={() => this._dismissNetworkError()}
        />
      );
    }

    // If the token data or the user's balance hasn't loaded yet, we show
    // a loading component.
    if (!this.state.tokenData) {
      return <Loading />;
    }

    // If everything is loaded, we render the application.
    return (
      <div className="container p-4">
        <div className="row">
          <div className="col-12">
            <h1>
              Greeting: { this.state.tokenData.greeting }
            </h1>
            <p>
              Address: { this.state.selectedAddress }
            </p>
          </div>
        </div>
      </div>
    );
  }


  async _connectWallet() {
    // This method is run when the user clicks the Connect. It connects the
    // dapp to the user's wallet, and initializes it.

    // To connect to the user's wallet, we have to run this method.
    // It returns a promise that will resolve to the user's address.
    const [selectedAddress] = await window.ethereum.enable();

    // Once we have the address, we can initialize the application.

    // First we check the network
    if (!this._checkNetwork()) {
      return;
    }

    this._initialize(selectedAddress);

    // We reinitialize it whenever the user changes their account.
    window.ethereum.on("accountsChanged", ([newAddress]) => {
      // `accountsChanged` event can be triggered with an undefined newAddress.
      // This happens when the user removes the Dapp from the "Connected
      // list of sites allowed access to your addresses" (Metamask > Settings > Connections)
      // To avoid errors, we reset the dapp state
      if (newAddress === undefined) {
        return this._resetState();
      }

      this._initialize(newAddress);
    });

    // We reset the dapp state if the network is changed
    window.ethereum.on("networkChanged", ([networkId]) => {
      this._resetState();
    });
  }

  _initialize(userAddress) {
    // This method initializes the dapp

    // We first store the user's address in the component's state
    this.setState({
      selectedAddress: userAddress,
    });

    // Then, we initialize ethers, fetch the token's data, and start polling
    // for the user's balance.

    // Fetching the token data and the user's balance are specific to this
    // sample project, but you can reuse the same initialization pattern.
    this._intializeEthers();
    this._getTokenData();
  }

  async _intializeEthers() {
    // We first initialize ethers by creating a provider using window.ethereum
    this._provider = new ethers.providers.Web3Provider(window.ethereum);

    // When, we initialize the contract using that provider and the token's
    // artifact. You can do this same thing with your contracts.
    this._token = new ethers.Contract(
      contractAddress.Token,
      GreeterArtifact.abi,
      this._provider.getSigner(0)
    );
  }

  // The next to methods are needed to start and stop polling data. While
  // the data being polled here is specific to this example, you can use this
  // pattern to read any data from your contracts.
  //
  // Note that if you don't need it to update in near real time, you probably
  // don't need to poll it. If that's the case, you can just fetch it when you
  // initialize the app, as we do with the token data.
  _startPollingData() {
    this._pollDataInterval = setInterval(() => this._updateGreeting(), 1000);

    // We run it once immediately so we don't have to wait for it
    this._updateBalance();
  }

  _stopPollingData() {
    clearInterval(this._pollDataInterval);
    this._pollDataInterval = undefined;
  }

  // The next two methods just read from the contract and store the results
  // in the component state.
  async _getTokenData() {
    const greeting = await this._token.greeting();
    this.setState({ tokenData: { greeting } });
  }

  async _updateGreeting() {
    const greeting = await this._token.greeting()
    this.setState({ greeting });
  }

  // This method just clears part of the state.
  _dismissTransactionError() {
    this.setState({ transactionError: undefined });
  }

  // This method just clears part of the state.
  _dismissNetworkError() {
    this.setState({ networkError: undefined });
  }

  // This is an utility method that turns an RPC error into a human readable
  // message.
  // _getRpcErrorMessage(error) {
  //   if (error.data) {
  //     return error.data.message;
  //   }
  //
  //   return error.message;
  // }

  // This method resets the state
  _resetState() {
    this.setState(this.initialState);
  }

  // This method checks if Metamask selected network is Localhost:8545
  _checkNetwork() {
    if (window.ethereum.networkVersion === HARDHAT_NETWORK_ID) {
      return true;
    }

    this.setState({
      networkError: 'Please connect Metamask to Localhost:8545'
    });

    return false;
  }
}
