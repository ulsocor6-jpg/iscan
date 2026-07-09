import {
  getOrCreateChainAddress,
  getAddressRecord,
  findUserByAddress,
  provisionMissingAddresses
} from "../walletAddressService.js";

export const getOrCreateRoninDepositAddress = (userId) =>
  getOrCreateChainAddress(userId, "RONIN");

export const getDepositRecord = (address) =>
  getAddressRecord(address);

export const findUserByRoninAddress = (address) =>
  findUserByAddress(address);

export const provisionAllRoninAddresses = () =>
  provisionMissingAddresses("RONIN");

export default {
  getOrCreateRoninDepositAddress,
  getDepositRecord,
  findUserByRoninAddress,
  provisionAllRoninAddresses
};
