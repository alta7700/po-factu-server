declare namespace NodeJS {
    interface ProcessEnv {
        DEBUG: "true" | "false";
        PORT: string;
    }
}