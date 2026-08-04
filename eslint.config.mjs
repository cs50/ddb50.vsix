import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["out", "dist", "**/*.d.ts"]
    },
    {
        files: ["src/**/*.ts"],
        plugins: {
            "@typescript-eslint": tseslint.plugin
        },
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 2022,
            sourceType: "module"
        },
        rules: {
            "@typescript-eslint/naming-convention": "warn",
            "curly": "warn",
            "eqeqeq": "warn",
            "no-throw-literal": "warn",
            "semi": "warn"
        }
    }
);
