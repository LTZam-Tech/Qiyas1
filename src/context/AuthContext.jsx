import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import AuthContext from './authContextObject.js';

const initialUser = {
  nameAr: "المسؤول",
  nameEn: "Admin User",
  role: "admin",
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(initialUser);

  const logout = () => {
    setUser(null);
  };

  const login = () => {
    setUser(initialUser);
  };

  const value = useMemo(() => ({ user, logout, login }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
