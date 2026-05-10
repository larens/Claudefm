#include <unistd.h>
#include <stdlib.h>
#include <string.h>

int main() {
    char *envp[10];
    int i = 0;

    char *path_env = strdup("PATH=/Users/lairuisi/.npm-global/bin:/Users/lairuisi/.orbstack/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin");
    char *home_env = strdup("HOME=/Users/lairuisi");
    char *user_env = strdup("USER=lairuisi");
    char *shell_env = strdup("SHELL=/bin/zsh");

    envp[i++] = path_env;
    envp[i++] = home_env;
    envp[i++] = user_env;
    envp[i++] = shell_env;
    envp[i++] = NULL;

    execle("/bin/zsh", "zsh", "-l", "-c",
          "python3 /Users/lairuisi/workspace/Claudiofm/claudiofm-chrome-extension/host/host.py",
          (char *)NULL, envp);

    free(path_env);
    free(home_env);
    free(user_env);
    free(shell_env);
    return 1;
}