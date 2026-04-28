import './polyfills';
import { renderPlayground } from './app';
import './styles.css';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Playground root #app was not found');
}

renderPlayground(root);
