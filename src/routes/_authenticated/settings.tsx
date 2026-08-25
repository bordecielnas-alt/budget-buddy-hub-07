import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Palette, RefreshCw, User } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { THEMES } from "@/lib/themes";
import { getN8nConfig, saveN8nConfig, syncFromN8n, testN8nConnection } from "@/lib/n8n.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Réglages — Budget Tracker" },
      {
        name: "description",
        content:
          "Gérez votre compte, l'apparence de l'application et la mise à jour des données depuis votre table N8N.",
      },
      { property: "og:title", content: "Réglages — Budget Tracker" },
      {
        property: "og:description",
        content: "Compte, thèmes et synchronisation N8N de Budget Tracker.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>
        <p className="text-sm text-muted-foreground">Compte, apparence et mise à jour des données.</p>
      </div>

      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">
            <User className="mr-2 size-4" /> Compte
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="mr-2 size-4" /> Apparence
          </TabsTrigger>
          <TabsTrigger value="sync">
            <RefreshCw className="mr-2 size-4" /> Mise à jour
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="pt-4">
          <AccountSection />
        </TabsContent>
        <TabsContent value="appearance" className="pt-4">
          <AppearanceSection />
        </TabsContent>
        <TabsContent value="sync" className="pt-4">
          <SyncSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccountSection() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
      return;
    }
    setPassword("");
    toast.success("Mot de passe mis à jour");
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Compte</CardTitle>
        <CardDescription>Identifiants de connexion à l'application.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={email} readOnly />
        </div>
        <Separator />
        <form className="space-y-3" onSubmit={changePassword}>
          <div className="space-y-2">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit">
            <KeyRound className="mr-2 size-4" /> Changer le mot de passe
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AppearanceSection() {
  const { settings, update } = useSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Apparence</CardTitle>
        <CardDescription>Thème et densité d'affichage, mémorisés sur votre compte.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => update.mutate({ theme: theme.id })}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                settings.theme === theme.id ? "border-primary ring-1 ring-primary" : "border-border"
              }`}
            >
              <span className="flex gap-1">
                {theme.palette.map((color) => (
                  <span
                    key={color}
                    className="size-4 rounded-full border border-border"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
              <span className="flex-1 text-sm font-medium">{theme.label}</span>
              {settings.theme === theme.id && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Densité</Label>
          <div className="flex gap-2">
            {(["comfortable", "compact"] as const).map((density) => (
              <Button
                key={density}
                variant={settings.density === density ? "default" : "outline"}
                size="sm"
                onClick={() => update.mutate({ density })}
              >
                {density === "comfortable" ? "Confortable" : "Compacte"}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SyncSection() {
  const loadConfig = useServerFn(getN8nConfig);
  const save = useServerFn(saveN8nConfig);
  const test = useServerFn(testN8nConnection);
  const sync = useServerFn(syncFromN8n);

  const config = useQuery({ queryKey: ["n8n-config"], queryFn: () => loadConfig({}) });

  const [url, setUrl] = useState("");
  const [headerName, setHeaderName] = useState("x-api-key");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<null | "save" | "test" | "preview" | "sync">(null);

  useEffect(() => {
    if (!config.data) return;
    setUrl(config.data.url);
    setHeaderName(config.data.headerName);
  }, [config.data]);

  async function run(action: "save" | "test" | "preview" | "sync") {
    setBusy(action);
    try {
      if (action === "save") {
        await save({ data: { url, headerName, token: token || undefined } });
        setToken("");
        toast.success("Configuration enregistrée");
      } else if (action === "test") {
        const result = await test({});
        toast.success(`Connexion OK : ${result.rows} ligne(s) exploitable(s), ${result.skipped} ignorée(s)`);
      } else {
        const report = await sync({ data: { preview: action === "preview" } });
        toast.success(report.message);
      }
      await config.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Liaison N8N (unidirectionnelle)</CardTitle>
          <CardDescription>
            L'application lit la table exposée par N8N. Aucune donnée n'est renvoyée vers N8N.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="n8n-url">URL du webhook N8N</Label>
            <Input
              id="n8n-url"
              placeholder="https://n8n.mondomaine.fr/webhook/budget"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="n8n-header">Nom de l'en-tête d'authentification</Label>
              <Input
                id="n8n-header"
                value={headerName}
                onChange={(e) => setHeaderName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="n8n-token">Jeton secret</Label>
              <Input
                id="n8n-token"
                type="password"
                placeholder={config.data?.hasToken ? "•••••• (enregistré)" : "Optionnel"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => run("save")} disabled={busy !== null}>
              {busy === "save" && <Loader2 className="mr-2 size-4 animate-spin" />} Enregistrer
            </Button>
            <Button variant="outline" onClick={() => run("test")} disabled={busy !== null}>
              {busy === "test" && <Loader2 className="mr-2 size-4 animate-spin" />} Tester
            </Button>
            <Button variant="outline" onClick={() => run("preview")} disabled={busy !== null}>
              {busy === "preview" && <Loader2 className="mr-2 size-4 animate-spin" />} Aperçu
            </Button>
            <Button onClick={() => run("sync")} disabled={busy !== null}>
              {busy === "sync" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              MAJ
            </Button>
            {config.data?.lastSync && (
              <Badge variant="secondary">
                Dernière MAJ : {new Date(config.data.lastSync).toLocaleString("fr-FR")}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Comment brancher N8N</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Dans N8N, créez un workflow avec un nœud <strong>Webhook</strong> en méthode GET.</p>
          <p>
            2. Ajoutez la lecture de votre table (Postgres, Google Sheets, Airtable…) puis un nœud
            <strong> Respond to Webhook</strong> renvoyant un tableau JSON (ou un CSV).
          </p>
          <p>
            3. Colonnes attendues : <code>Type, Date, Payee, Amount, Account, Description, Category</code>.
            Les variantes françaises sont reconnues automatiquement.
          </p>
          <p>
            4. Protégez le webhook (Header Auth) et renseignez ici le nom d'en-tête et le jeton. Le jeton
            reste stocké côté serveur, jamais dans le navigateur.
          </p>
          <p>
            5. Cliquez sur <strong>Tester</strong>, puis <strong>Aperçu</strong> pour vérifier l'impact,
            puis <strong>MAJ</strong> pour appliquer.
          </p>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Et une vraie synchronisation bidirectionnelle ?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Aujourd'hui la MAJ est unidirectionnelle : N8N est la source, l'app est le miroir. Les lignes
            supprimées dans N8N ne sont pas supprimées ici, par sécurité.
          </p>
          <p>
            Passer en bidirectionnel implique : un identifiant stable partagé des deux côtés, un horodatage
            de modification pour arbitrer les conflits (last-write-wins ou revue manuelle), un journal des
            suppressions (tombstones) pour distinguer « supprimé » de « jamais reçu », un webhook d'écriture
            côté N8N et une file de renvoi en cas d'échec réseau.
          </p>
          <p>
            La structure actuelle est déjà prête : chaque ligne conserve sa clé source et un marqueur
            « modifiée localement », ce qui permettra de ne renvoyer que les écarts.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
