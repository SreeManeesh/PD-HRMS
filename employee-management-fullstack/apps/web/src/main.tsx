import React from 'react';
import { createRoot } from 'react-dom/client';
import { EmployeeWizard } from './EmployeeWizard';
import './styles.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><EmployeeWizard /></React.StrictMode>);
