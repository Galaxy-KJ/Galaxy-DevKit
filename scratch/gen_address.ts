import { StrKey } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

const contractId = new Uint8Array(32);
crypto.getRandomValues(contractId);
const validAddress = StrKey.encodeContract(Buffer.from(contractId));
console.log(validAddress);
