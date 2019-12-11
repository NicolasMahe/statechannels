import {
  JsonRpcErrorResponse,
  JsonRpcError,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification
} from '@statechannels/channel-provider';

export type ChannelStatus = 'proposed' | 'opening' | 'funding' | 'running' | 'closing' | 'closed';

export interface Participant {
  participantId: string; // App allocated id, used for relaying messages to the participant
  signingAddress: string; // Address used to sign channel updates
  destination: string; // Address of EOA to receive channel proceeds (the account that'll get the funds).
}

export interface AllocationItem {
  destination: string; // Address of EOA to receive channel proceeds.
  amount: string; // How much funds will be transferred to the destination address.
}

export interface Allocation {
  token: string; // The token's contract address.
  allocationItems: AllocationItem[]; // A list of allocations (how much funds will each destination address get).
}

export interface Message<T = object> {
  recipient: string; // Identifier of user that the message should be relayed to
  sender: string; // Identifier of user that the message is from
  data: T; // Message payload. Format defined by wallet and opaque to app.
  // But useful to be able to specify, for the purposes of the fake-client
}

export interface Funds {
  token: string;
  amount: string;
}

export interface ChannelResult {
  participants: Participant[];
  allocations: Allocation[];
  appData: string;
  appDefinition: string;
  channelId: string;
  status: ChannelStatus;
  // funding: Funds[]; // do we even need this?
  turnNum: string;
}

export type UnsubscribeFunction = () => void;

// The message Payload is designed to be opaque to the app. However, it's useful
// to be able to specify the Payload type for the FakeChannelClient, as we'll be
// manipulating it within the client.
export interface ChannelClientInterface<Payload = object> {
  onMessageQueued: (callback: (message: Message<Payload>) => void) => UnsubscribeFunction;
  onChannelUpdated: (callback: (result: ChannelResult) => void) => UnsubscribeFunction;
  onChannelProposed: (callback: (result: ChannelResult) => void) => UnsubscribeFunction;
  createChannel: (
    participants: Participant[],
    allocations: Allocation[],
    appDefinition: string,
    appData: string
  ) => Promise<ChannelResult>;
  joinChannel: (channelId: string) => Promise<ChannelResult>;
  updateChannel: (
    channelId: string,
    participants: Participant[],
    allocations: Allocation[],
    appData: string
  ) => Promise<ChannelResult>;
  closeChannel: (channelId: string) => Promise<ChannelResult>;
  pushMessage: (message: Message<Payload>) => Promise<PushMessageResult>;
  getAddress: () => Promise<string>;
}

export interface EventsWithArgs {
  MessageQueued: [Message<ChannelResult>];
  ChannelUpdated: [ChannelResult];
  // TODO: Is `ChannelResult` the right type to use here?
  ChannelProposed: [ChannelResult];
}

type UnsubscribeFunction = () => void;

interface CreateChannelParameters {
  participants: Participant[];
  allocations: Allocation[];
  appDefinition: string;
  appData: string;
}

interface UpdateChannelParameters {
  channelId: string;
  participants: Participant[];
  allocations: Allocation[];
  appData: string;
}

export type GetAddressRequest = JsonRpcRequest<'GetAddress', {}>; // todo: what are params

export type CreateChannelRequest = JsonRpcRequest<'CreateChannel', CreateChannelParameters>;

export type CreateChannelResponse = JsonRpcResponse<ChannelResult>;

export interface JoinChannelParameters {
  channelId: string;
}

export type JoinChannelRequest = JsonRpcRequest<'JoinChannel', JoinChannelParameters>;

export type JoinChannelResponse = JsonRpcResponse<ChannelResult>;

export type UpdateChannelRequest = JsonRpcRequest<'UpdateChannel', UpdateChannelParameters>;

export type PushMessageRequest = JsonRpcRequest<'PushMessage', Message>;

export interface PushMessageResult {
  success: boolean;
}

export type PushMessageResponse = JsonRpcResponse<PushMessageResult>;

export interface CloseChannelParameters {
  channelId: string;
}
export type CloseChannelRequest = JsonRpcRequest<'CloseChannel', CloseChannelParameters>;
export type CloseChannelResponse = JsonRpcResponse<ChannelResult>;

export type ChannelProposedNotification = JsonRpcNotification<'ChannelProposed', ChannelResult>;
export type ChannelUpdatedNotification = JsonRpcNotification<'ChannelUpdated', ChannelResult>;
export type ChannelClosingNotification = JsonRpcNotification<'ChannelClosed', ChannelResult>;

export type MessageQueuedNotification = JsonRpcNotification<'MessageQueued', Message>;

export type Notification =
  | ChannelProposedNotification
  | ChannelUpdatedNotification
  | ChannelClosingNotification
  | MessageQueuedNotification;

export type NotificationName = Notification['method'];

export type Request =
  | GetAddressRequest
  | CreateChannelRequest
  | JoinChannelRequest
  | UpdateChannelRequest
  | PushMessageRequest
  | CloseChannelRequest;

export enum ErrorCodes {
  SIGNING_ADDRESS_NOT_FOUND = 1000,
  INVALID_APP_DEFINITION = 1001,
  INVALID_APP_DATA = 1002,
  UNSUPPORTED_TOKEN = 1003,
  CHANNEL_NOT_FOUND = 1004
}

export class ChannelClientError implements JsonRpcErrorResponse {
  jsonrpc: '2.0' = '2.0';

  error: JsonRpcError = {
    code: ErrorCodes.SIGNING_ADDRESS_NOT_FOUND,
    message: 'Something went wrong'
  };

  constructor(public readonly id: number) {}

  toJSON() {
    return {
      jsonrpc: this.jsonrpc,
      id: this.id,
      error: this.error
    };
  }
}

export class SigningAddressNotFoundError extends ChannelClientError {
  error: JsonRpcError = {
    code: ErrorCodes.SIGNING_ADDRESS_NOT_FOUND,
    message: 'Signing address not found'
  };
}

export class InvalidAppDefinitionError extends ChannelClientError {
  error: JsonRpcError = {
    code: ErrorCodes.INVALID_APP_DEFINITION,
    message: 'Invalid app definition'
  };
}

export class InvalidAppDataError extends ChannelClientError {
  error: JsonRpcError = {
    code: ErrorCodes.INVALID_APP_DATA,
    message: 'Invalid app data'
  };
}

export class UnsupportedTokenError extends ChannelClientError {
  error: JsonRpcError = {
    code: ErrorCodes.UNSUPPORTED_TOKEN,
    message: 'Unsupported token'
  };
}

export class ChannelNotFoundError extends ChannelClientError {
  error: JsonRpcError = {
    code: ErrorCodes.CHANNEL_NOT_FOUND,
    message: 'Channel not found'
  };
}

export const ErrorCodesToObjectsMap: {[key in ErrorCodes]: typeof ChannelClientError} = {
  [ErrorCodes.CHANNEL_NOT_FOUND]: ChannelNotFoundError,
  [ErrorCodes.INVALID_APP_DATA]: InvalidAppDataError,
  [ErrorCodes.INVALID_APP_DEFINITION]: InvalidAppDefinitionError,
  [ErrorCodes.SIGNING_ADDRESS_NOT_FOUND]: SigningAddressNotFoundError,
  [ErrorCodes.UNSUPPORTED_TOKEN]: UnsupportedTokenError
};
