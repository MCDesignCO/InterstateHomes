'use client';

import React, { createContext, useContext, useState } from 'react';
import type { UserRole } from '@interstate/shared';

interface RoleContextValue {
  role: UserRole;
  setRole: (role: UserRole) => void;
  subCompanyId: string;
}

const RoleContext = createContext<RoleContextValue>({
  role: 'estimator_approver',
  setRole: () => {},
  subCompanyId: 'sub-red-cliffs',
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>('estimator_approver');
  return (
    <RoleContext.Provider value={{ role, setRole, subCompanyId: 'sub-red-cliffs' }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
