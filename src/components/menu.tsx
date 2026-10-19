import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Tv, Radio } from "lucide-react";
import { Button } from "./ui/button";

export default function Menu() {
	// set query params as the view and reload
	function onSelectView(view: string) {
		const url = new URL(window.location.href);
		url.searchParams.set("view", view);
		window.location.href = url.toString();
	}

	return (
		<main className="min-h-screen px-4">
			<div className="max-w-4xl mx-auto">
				<div className="mb-12 text-center">
					<h1 className="text-3xl font-bold text-primary mb-3 pt-16">
						Ruleta Digital
					</h1>
					<p className="text-xl text-muted-foreground">
						Sistema profesional de ruleta para eventos
					</p>
				</div>

				<div className="grid md:grid-cols-2 gap-6">
					<Card className="hover:shadow-lg transition-shadow">
						<CardHeader>
							<div className="flex items-center gap-3 mb-2">
								<Tv className="text-primary" size={28} />
								<CardTitle>Pantalla Pública</CardTitle>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-muted-foreground text-sm">
								Visualización en pantalla completa para TV
							</p>
							<Button className="w-full" onMouseDown={() => onSelectView("tv")}>
								Abrir Pantalla
							</Button>
						</CardContent>
					</Card>

					<Card className="hover:shadow-lg transition-shadow">
						<CardHeader>
							<div className="flex items-center gap-3 mb-2">
								<Radio className="text-primary" size={28} />
								<CardTitle>Panel Operador</CardTitle>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-muted-foreground text-sm">
								Controla la ruleta de forma remota desde tu dispositivo
							</p>
							<Button
								className="w-full"
								onMouseDown={() => onSelectView("admin")}
							>
								Abrir Panel
							</Button>
						</CardContent>
					</Card>
				</div>

				<Card className="mt-8 bg-accent/10 border-accent">
					<CardHeader>
						<CardTitle>Cómo usar</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3 text-sm">
						<div className="flex gap-3">
							<span className="font-bold text-primary">1.</span>
							<p>
								Abre el Panel Administrativo para crear y configurar premios
							</p>
						</div>
						<div className="flex gap-3">
							<span className="font-bold text-primary">2.</span>
							<p>
								Abre la Pantalla Pública en el TV/Monitor que mostrarán a tus
								invitados
							</p>
						</div>
						<div className="flex gap-3">
							<span className="font-bold text-primary">3.</span>
							<p>
								Usa el Panel Operador (desde tu móvil) para controlar la ruleta
							</p>
						</div>
						<div className="flex gap-3">
							<span className="font-bold text-primary">4.</span>
							<p>
								El resultado se sincronizará automáticamente con la pantalla
								pública
							</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
