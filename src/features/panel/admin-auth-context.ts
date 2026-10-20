import { createContext, useContext } from "react";

export interface AdminAuthValue {
	logout: () => void;
}

export const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function useAdminAuth(): AdminAuthValue {
	const context = useContext(AdminAuthContext);
	if (!context) {
		throw new Error("useAdminAuth debe usarse dentro de AdminAuthProvider.");
	}
	return context;
}
