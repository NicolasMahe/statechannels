pragma solidity 0.7.4;

interface IStatusManager {
    enum ChannelMode {Open, Challenge, Finalized}

    struct ChannelData {
        uint48 turnNumRecord;
        uint48 finalizesAt;
        bytes32 stateHash; // keccak256(abi.encode(State))
        address challengerAddress;
        bytes32 outcomeHash;
    }
}
