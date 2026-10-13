import type { Config } from "jest";

const config: Config = {
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  preset: "ts-jest/presets/default-esm",
  reporters: ["default", "<rootDir>/tests/integration/case-reporter.cjs"],
  roots: ["<rootDir>/tests/integration"],
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tests/integration/tsconfig.json",
        useESM: true,
      },
    ],
  },
};

export default config;
