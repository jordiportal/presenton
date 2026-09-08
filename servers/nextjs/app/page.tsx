import AuthGate from "@/components/Auth/AuthGate";
import Home from "@/components/Home";
import { ConfigurationInitializer } from "./ConfigurationInitializer";
import { isAuthDisabled } from "@/utils/auth";
import { getServerAuthStatus } from "@/utils/serverAuth";

type HomePageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const page = async ({ searchParams }: HomePageProps) => {
    if (isAuthDisabled()) {
        return (
            <ConfigurationInitializer>
                <Home />
            </ConfigurationInitializer>
        );
    }

    const params = searchParams ? await searchParams : {};
    const oauthCode = params.code;
    const hasOAuthCode = typeof oauthCode === "string" && oauthCode.length > 0;
    if (hasOAuthCode) {
        return <AuthGate />;
    }

    const status = await getServerAuthStatus();
    if (status.configured && status.authenticated) {
        return (
            <ConfigurationInitializer>
                <Home />
            </ConfigurationInitializer>
        );
    }

    return <AuthGate />;
};

export default page;
