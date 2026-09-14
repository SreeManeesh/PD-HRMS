/**
 * Frontend Smoke Tests
 * Covers:
 * - App root mounting without crash
 * - DemoBanner component (full & compact modes)
 * - Login view rendering with inputs & controls
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import DemoBanner from '../components/shared/DemoBanner.jsx';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import Login from '../pages/Auth/Login.jsx';
import ErrorBoundary from '../components/shared/ErrorBoundary.jsx';
import StatusBadge from '../components/shared/StatusBadge.jsx';
import ClassicTablePayslip from '../components/payslip/ClassicTablePayslip.jsx';

describe('DemoBanner Component', () => {
  it('renders full demo banner with specified module name', () => {
    render(<DemoBanner module="Expenses" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Expenses')).toBeInTheDocument();
  });

  it('renders compact pill badge in compact mode', () => {
    const { container } = render(<DemoBanner module="HR Dashboard" compact />);
    expect(container.textContent).toContain('Demo Preview');
    const span = container.querySelector('span');
    expect(span).toHaveAttribute('title', expect.stringContaining('demo data'));
  });
});

describe('Login Component', () => {
  it('renders sign-in form with email, password, and submit controls', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@company.com/i)).toBeInTheDocument();
    expect(screen.getByText(/Work Email or Username/i)).toBeInTheDocument();
    expect(screen.getByText(/Password/i)).toBeInTheDocument();
  });
});

describe('ErrorBoundary Component', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Safe Content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Safe Content')).toBeInTheDocument();
  });

  it('catches render error and displays branded fallback UI', () => {
    const ProblemChild = () => {
      throw new Error('Test crash');
    };

    // Suppress console.error in test runner for intentional throw
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      render(
        <ErrorBoundary>
          <ProblemChild />
        </ErrorBoundary>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Refresh Page/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Go to Dashboard/i })).toBeInTheDocument();
    } finally {
      console.error = originalConsoleError;
    }
  });
});

describe('StatusBadge Component', () => {
  it('renders status badge with role=status and accessible text', () => {
    render(<StatusBadge label="Active" color="#047857" bg="#ecfdf5" />);
    const badge = screen.getByRole('status');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', 'Status: Active');
    expect(badge).toHaveTextContent('Active');
  });
});

describe('ClassicTablePayslip Component', () => {
  it('renders company details, employee info, and net pay', () => {
    const mockCompany = {
      name: 'Acme Technologies Pvt Ltd',
      address: 'Tech Park, Bangalore',
    };
    const mockEmployee = {
      firstName: 'Rahul',
      lastName: 'Sharma',
      employeeCode: 'EMP101',
      designation: 'Staff Engineer',
    };
    const mockPayroll = {
      month: 'August - 2026',
      title: 'Payslip for the month of',
      earnings: [{ name: 'BASIC', amount: 50000 }],
      deductions: [{ name: 'PF', amount: 6000 }],
      netPay: 44000,
      netPayInWords: 'Forty Four Thousand Rupees Only',
    };

    render(
      <ClassicTablePayslip
        company={mockCompany}
        employee={mockEmployee}
        payroll={mockPayroll}
      />
    );

    expect(screen.getAllByText(/Acme Technologies Pvt Ltd/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Tech Park, Bangalore/i)).toBeInTheDocument();
    expect(screen.getByText(/August - 2026/i)).toBeInTheDocument();
    expect(screen.getByText('Rahul Sharma')).toBeInTheDocument();
    expect(screen.getByText('Forty Four Thousand Rupees Only')).toBeInTheDocument();
  });
});
