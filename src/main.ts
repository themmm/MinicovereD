import './styles/app.css';
import { mountShell } from './app/shell.ts';

const root = document.getElementById('app');
if (!root) throw new Error('mdcovergen: #app root element is missing');
mountShell(root);
