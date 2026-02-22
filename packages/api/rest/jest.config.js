module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^@galaxy-kj/core-defi-protocols$': '<rootDir>/../../core/defi-protocols/src/index.ts',
        '^(\\.\\.?/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
        }],
    },
    coverageDirectory: 'coverage',
    coverageReporters: ['json', 'lcov', 'text', 'clover', 'json-summary'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/index.ts',
    ],
};
