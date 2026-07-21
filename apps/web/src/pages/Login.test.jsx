// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Login from './Login.jsx';

describe('store login page', () => {
  it('submits store credentials without exposing public registration', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<Login onLogin={onLogin} isSubmitting={false} errorMessage="" />);

    expect(screen.queryByText(/daftar/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Username'), 'owner-toko');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(onLogin).toHaveBeenCalledWith({ username: 'owner-toko', password: 'secret123' });
  });

  it('shows parent errors and submitting state', () => {
    render(<Login onLogin={vi.fn()} isSubmitting errorMessage="Login gagal" />);
    expect(screen.getByText('Login gagal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Memproses...' })).toBeDisabled();
  });
});
