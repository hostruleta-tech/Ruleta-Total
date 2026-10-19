import { cn } from "@/lib/utils";
import logo from "../assets/logo.png";

export function Layout({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center w-full min-h-screen bg-background bg-linear-to-br from-background to-muted px-8",
				className,
			)}
		>
			<header className="w-full flex justify-start max-w-4xl">
				<img src={logo} alt="Logo de Keyton" width={100} />
			</header>
			{children}
		</div>
	);
}
