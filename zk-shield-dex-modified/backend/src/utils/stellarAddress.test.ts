import { isValidStellarAddress } from "./stellarAddress";

describe("isValidStellarAddress", () => {
  it("accepts a valid Stellar public key", () => {
    expect(isValidStellarAddress("GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H")).toBe(true);
  });

  it("rejects an invalid format", () => {
    expect(isValidStellarAddress("invalid-address")).toBe(false);
  });
});
