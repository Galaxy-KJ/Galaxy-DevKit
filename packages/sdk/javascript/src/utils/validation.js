// src/utils/validation.js
'use strict';


function validateString(value, name) {
if (!value || typeof value !== 'string') {
throw new Error(`${name} must be a non-empty string`);
}
}


module.exports = { validateString };