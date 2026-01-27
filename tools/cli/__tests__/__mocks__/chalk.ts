const passthrough = (value: unknown) => String(value);

const chalk = {
  red: passthrough,
  green: passthrough,
  blue: passthrough,
  yellow: passthrough,
  gray: passthrough,
  cyan: passthrough,
};

export default chalk;
