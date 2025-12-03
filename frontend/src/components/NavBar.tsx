import type { ReactNode } from 'react';

import logo from '@assets/logo.png';

interface NavBarProps {
  rightSlot?: ReactNode;
}

export function NavBar({ rightSlot }: NavBarProps) {
  return (
    <header className="flex items-center justify-between px-6 py-6">
      <div className="flex items-center gap-3">
        <img src={logo} alt="309 Interview Agent" className="h-11 w-auto" />
      </div>
      <div className="flex items-center gap-3">{rightSlot}</div>
    </header>
  );
}

