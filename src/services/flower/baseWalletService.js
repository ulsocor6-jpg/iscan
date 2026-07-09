import {
  getOrCreateChainAddress,
  getAddressRecord,
  findUserByAddress,
  provisionMissingAddresses
} from "../walletAddressService.js";

export const getOrCreateBaseDepositAddress = (userId) =>
  getOrCreateChainAddress(userId, "BASE");

export const getDepositRecord = (address) =>
  getAddressRecord(address);

export const findUserByBaseAddress = (address) =>
  findUserByAddress(address);

export const provisionAllBaseAddresses = () =>
  provisionMissingAddresses("BASE");

export default {
  getOrCreateBaseDepositAddress,
  getDepositRecord,
  findUserByBaseAddress,
  provisionAllBaseAddresses
};
