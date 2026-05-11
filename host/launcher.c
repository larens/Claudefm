#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <stdio.h>

int main(int argc, char *argv[]) {
    char *envp[10];
    int i = 0;
    char resolved_path[PATH_MAX];
    char command[PATH_MAX + 32];
    char *last_slash = NULL;

    char *path_env = strdup("PATH=/Users/lairuisi/.npm-global/bin:/Users/lairuisi/.orbstack/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin");
    char *home_env = strdup("HOME=/Users/lairuisi");
    char *user_env = strdup("USER=lairuisi");
    char *shell_env = strdup("SHELL=/bin/zsh");

    envp[i++] = path_env;
    envp[i++] = home_env;
    envp[i++] = user_env;
    envp[i++] = shell_env;
    envp[i++] = NULL;

    if (argc < 1 || realpath(argv[0], resolved_path) == NULL) {
        free(path_env);
        free(home_env);
        free(user_env);
        free(shell_env);
        return 1;
    }

    last_slash = strrchr(resolved_path, '/');
    if (last_slash == NULL) {
        free(path_env);
        free(home_env);
        free(user_env);
        free(shell_env);
        return 1;
    }
    *last_slash = '\0';
    snprintf(command, sizeof(command), "python3 \"%s/host.py\"", resolved_path);

    execle("/bin/zsh", "zsh", "-l", "-c",
          command,
          (char *)NULL, envp);

    free(path_env);
    free(home_env);
    free(user_env);
    free(shell_env);
    return 1;
}
