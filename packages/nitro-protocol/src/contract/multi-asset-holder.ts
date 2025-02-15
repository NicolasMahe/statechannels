import {utils, BigNumber, constants} from 'ethers';
import ExitFormat, {AllocationType} from '@statechannels/exit-format';

import {parseEventResult} from '../ethers-utils';

import {decodeGuaranteeData} from './outcome';

export interface DepositedEvent {
  destination: string;
  amountDeposited: BigNumber;
  destinationHoldings: BigNumber;
}

export function getDepositedEvent(eventResult: any[]): DepositedEvent {
  const {destination, amountDeposited, destinationHoldings} = parseEventResult(eventResult);
  return {
    destination,
    amountDeposited: BigNumber.from(amountDeposited),
    destinationHoldings: BigNumber.from(destinationHoldings),
  };
}

export function convertBytes32ToAddress(bytes32: string): string {
  const normalized = utils.hexZeroPad(bytes32, 32);
  return utils.getAddress(`0x${normalized.slice(-40)}`);
}

// e.g.,
// 0x9546E319878D2ca7a21b481F873681DF344E0Df8 becomes
// 0x0000000000000000000000009546E319878D2ca7a21b481F873681DF344E0Df8
export function convertAddressToBytes32(address: string): string {
  const normalizedAddress = BigNumber.from(address).toHexString();
  if (!utils.isAddress(address)) {
    throw new Error(`Input is not a valid Ethereum address.`);
  }

  // We pad to 66 = (32*2) + 2('0x')
  return utils.hexZeroPad(normalizedAddress, 32);
}

/**
 *
 * Emulates solidity code. TODO replace with PureEVM implementation?
 * @param initialHoldings
 * @param allocation
 * @param indices
 */
export function computeClaimEffectsAndInteractions(
  initialHoldings: string,
  sourceAllocations: ExitFormat.Allocation[], // we must index this with a JS number that is less than 2**32 - 1
  targetAllocations: ExitFormat.Allocation[], // we must index this with a JS number that is less than 2**32 - 1
  indexOfTargetInSource: number,
  targetAllocationIndicesToPayout: number[]
): {
  newSourceAllocations: ExitFormat.Allocation[];
  newTargetAllocations: ExitFormat.Allocation[];
  exitAllocations: ExitFormat.Allocation[];
  totalPayouts: string;
} {
  let totalPayouts = BigNumber.from(0);
  let k = 0;

  // copy allocations
  const newSourceAllocations: ExitFormat.Allocation[] = [];
  const newTargetAllocations: ExitFormat.Allocation[] = [];
  const exitAllocations: ExitFormat.Allocation[] = [];
  for (let i = 0; i < sourceAllocations.length; i++) {
    newSourceAllocations.push({
      destination: sourceAllocations[i].destination,
      amount: sourceAllocations[i].amount,
      metadata: sourceAllocations[i].metadata,
      allocationType: sourceAllocations[i].allocationType,
    });
  }
  for (let i = 0; i < targetAllocations.length; i++) {
    newTargetAllocations.push({
      destination: targetAllocations[i].destination,
      amount: targetAllocations[i].amount,
      metadata: targetAllocations[i].metadata,
      allocationType: targetAllocations[i].allocationType,
    });
    exitAllocations.push({
      destination: targetAllocations[i].destination,
      amount: '0x00',
      metadata: targetAllocations[i].metadata,
      allocationType: targetAllocations[i].allocationType,
    });
  }

  let sourceSurplus = BigNumber.from(initialHoldings);
  for (
    let sourceAllocationIndex = 0;
    sourceAllocationIndex < indexOfTargetInSource;
    sourceAllocationIndex++
  ) {
    if (BigNumber.from(sourceSurplus).isZero()) break;
    const affordsForDestination = min(
      BigNumber.from(sourceAllocations[sourceAllocationIndex].amount),
      sourceSurplus
    );
    sourceSurplus = sourceSurplus.sub(affordsForDestination);
  }

  let targetSurplus = min(
    sourceSurplus,
    BigNumber.from(sourceAllocations[indexOfTargetInSource].amount)
  );

  if (sourceAllocations[indexOfTargetInSource].allocationType !== AllocationType.guarantee)
    throw Error('not a guarantee allocation');

  const guaranteeDestinations = decodeGuaranteeData(
    sourceAllocations[indexOfTargetInSource].metadata
  );

  // for each guarantee destination
  for (let j = 0; j < guaranteeDestinations.length; j++) {
    if (targetSurplus.isZero()) break;
    for (let i = 0; i < newTargetAllocations.length; i++) {
      if (targetSurplus.isZero()) break;
      // search for it in the allocation
      if (
        BigNumber.from(guaranteeDestinations[j]).eq(
          BigNumber.from(newTargetAllocations[i].destination)
        )
      ) {
        // if we find it, compute new amount
        const affordsForDestination = min(
          BigNumber.from(newTargetAllocations[i].amount),
          targetSurplus
        );
        // decrease surplus by the current amount regardless of hitting a specified index
        targetSurplus = targetSurplus.sub(affordsForDestination);
        if (
          targetAllocationIndicesToPayout.length === 0 ||
          (k < targetAllocationIndicesToPayout.length && targetAllocationIndicesToPayout[k] === i)
        ) {
          // only if specified in supplied indices, or we if we are doing "all"
          // reduce the current allocationItem.amount
          newTargetAllocations[i].amount = BigNumber.from(newTargetAllocations[i].amount)
            .sub(affordsForDestination)
            .toHexString();
          newSourceAllocations[indexOfTargetInSource].amount = BigNumber.from(
            newSourceAllocations[indexOfTargetInSource].amount
          )
            .sub(affordsForDestination)
            .toHexString();

          // increase the relevant exit allocation
          exitAllocations[i].amount = BigNumber.from(exitAllocations[i].amount)
            .add(affordsForDestination)
            .toHexString();
          totalPayouts = totalPayouts.add(affordsForDestination);
          // move on to the next supplied index
          ++k;
        }
        break;
      }
    }
  }

  return {
    newSourceAllocations,
    newTargetAllocations,
    exitAllocations,
    totalPayouts: totalPayouts.toHexString(),
  };
}

/**
 *
 * Emulates solidity code. TODO replace with PureEVM implementation?
 * @param initialHoldings
 * @param allocation
 * @param indices
 */
export function computeTransferEffectsAndInteractions(
  initialHoldings: string,
  allocations: ExitFormat.Allocation[], // we must index this with a JS number that is less than 2**32 - 1
  indices: number[]
): {
  newAllocations: ExitFormat.Allocation[];
  allocatesOnlyZeros: boolean;
  exitAllocations: ExitFormat.Allocation[];
  totalPayouts: string;
} {
  let totalPayouts = BigNumber.from(0);
  const newAllocations: ExitFormat.Allocation[] = [];
  const exitAllocations: ExitFormat.Allocation[] = Array(
    indices.length > 0 ? indices.length : allocations.length
  ).fill({
    destination: constants.HashZero,
    amount: '0x00',
    metadata: '0x',
    allocationType: 0,
  });
  let allocatesOnlyZeros = true;
  let surplus = BigNumber.from(initialHoldings);
  let k = 0;

  for (let i = 0; i < allocations.length; i++) {
    newAllocations.push({
      destination: allocations[i].destination,
      amount: BigNumber.from(0).toHexString(),
      metadata: allocations[i].metadata,
      allocationType: allocations[i].allocationType,
    });
    const affordsForDestination = min(BigNumber.from(allocations[i].amount), surplus);
    if (indices.length == 0 || (k < indices.length && indices[k] === i)) {
      newAllocations[i].amount = BigNumber.from(allocations[i].amount)
        .sub(affordsForDestination)
        .toHexString();
      exitAllocations[k] = {
        destination: allocations[i].destination,
        amount: affordsForDestination.toHexString(),
        metadata: allocations[i].metadata,
        allocationType: allocations[i].allocationType,
      };
      totalPayouts = totalPayouts.add(affordsForDestination);
      ++k;
    } else {
      newAllocations[i].amount = allocations[i].amount;
    }
    if (!BigNumber.from(newAllocations[i].amount).isZero()) allocatesOnlyZeros = false;
    surplus = surplus.sub(affordsForDestination);
  }

  return {
    newAllocations,
    allocatesOnlyZeros,
    exitAllocations,
    totalPayouts: totalPayouts.toHexString(),
  };
}

function min(a: BigNumber, b: BigNumber) {
  return a.gt(b) ? b : a;
}
