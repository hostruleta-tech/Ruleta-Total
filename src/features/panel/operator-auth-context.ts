import { createContext, useContext } from "react";

export interface OperatorAuthValue {
	isAuthenticated: boolean;
	checkingAuth: boolean;
	operatorFetch: (
		path: string,
		init?: RequestInit,
	) => Promise<Response | null>;
	logout: () => Promise<void>;
}

export const OperatorAuthContext = createContext<OperatorAuthValue | null>(
	null,
);

export function useOperatorAuth(): OperatorAuthValue {
	const context = useContext(OperatorAuthContext);
	if (!context) {
		throw new Error(
			"useOperatorAuth debe usarse dentro de OperatorAuthProvider.",
		);
	}
	return context;
}
