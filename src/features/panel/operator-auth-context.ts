import { createContext, useContext } from "react";

export interface OperatorAuthValue {
	hasPassword: boolean;
	operatorFetch: (
		path: string,
		init?: RequestInit,
	) => Promise<Response | null>;
	clearPassword: () => void;
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
