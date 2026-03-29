type OraInstance = {
  start: () => OraInstance;
  succeed: (text?: string) => OraInstance;
  fail: (text?: string) => OraInstance;
  stop: () => OraInstance;
};

const createSpinner = (): OraInstance => {
  return {
    start: () => createSpinner(),
    succeed: () => createSpinner(),
    fail: () => createSpinner(),
    stop: () => createSpinner(),
  };
};

const ora = () => createSpinner();

export default ora;
