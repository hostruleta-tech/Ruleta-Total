export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<main className="dark bg-background text-foreground min-h-dvh w-full relative">
			{children}
		</main>
	);
}
