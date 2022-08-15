const path = require('path');
const {
    Configuration
} = require('webpack');

/** @type {Configuration} */
const config = {
    mode: "development",
    target: 'node',
    entry: {
        main: './src/main.ts'
    },
    output: {
        path: path.resolve(__dirname, './dist'),
        filename: `[name].js`,
        publicPath: ''
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
    },
    module: {
        rules: [{
            test: /\.tsx?$/i,
            exclude: /node_modules/,
            use: {
                loader: "ts-loader"
            },
        }, {
            test: /\.css$/i,
            use: ["style-loader", "css-loader"],
        }, ],
    },
    devtool: "inline-source-map",
};

module.exports = config;