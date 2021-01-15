import {Logger} from 'pino';

import {ChainServiceInterface} from '../chain-service';
import {ChainServiceRequest} from '../models/chain-service-request';
import {AdjudicatorStatusModel} from '../models/adjudicator-status';
import {DBDefundChannelObjective} from '../models/objective';
import {Store} from '../wallet/store';
import {WalletResponse} from '../wallet/wallet-response';

export class ChannelDefunder {
  constructor(
    private store: Store,
    private chainService: ChainServiceInterface,
    private logger: Logger,
    private timingMetrics = false
  ) {}
  public static create(
    store: Store,
    chainService: ChainServiceInterface,
    logger: Logger,
    timingMetrics = false
  ): ChannelDefunder {
    return new ChannelDefunder(store, chainService, logger, timingMetrics);
  }

  public async crank(
    objective: DBDefundChannelObjective,
    _response: WalletResponse
  ): Promise<void> {
    const {targetChannelId: channelId} = objective.data;
    await this.store.transaction(async tx => {
      const channel = await this.store.getAndLockChannel(channelId, tx);

      if (!channel) {
        this.logger.error(`No channel found for channel id ${channelId}`);
        await this.store.markObjectiveStatus(objective, 'failed', tx);
        return;
      }

      if (channel.fundingStrategy !== 'Direct') {
        // TODO: https://github.com/statechannels/statechannels/issues/3124
        this.logger.error(`Only direct funding is currently supported.`);
        await this.store.markObjectiveStatus(objective, 'failed', tx);
        return;
      }

      const result = await AdjudicatorStatusModel.getAdjudicatorStatus(tx, channelId);

      if (result.status === 'Channel Finalized') {
        if (!result.outcomePushed) {
          await ChainServiceRequest.insertOrUpdate(channelId, 'pushOutcome', tx);
          this.chainService.pushOutcomeAndWithdraw(result.states[0], channel.myAddress);
          await this.store.markObjectiveStatus(objective, 'succeeded', tx);
        } else {
          this.logger.trace('Outcome already pushed, doing nothing');
        }
      } else if (channel.hasConclusionProof) {
        await ChainServiceRequest.insertOrUpdate(channelId, 'withdraw', tx);
        this.chainService.concludeAndWithdraw(channel.support);
        await this.store.markObjectiveStatus(objective, 'succeeded', tx);
        return;
      }
    });
  }
}
