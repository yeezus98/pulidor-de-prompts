// Evita una ventana de consola extra en Windows (no afecta a Mac).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pulidor_de_prompts_lib::run()
}
