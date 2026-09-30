if (process.platform === 'win32') {
  process.env.NAPI_RS_FORCE_WASI ??= '1'
}

const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
