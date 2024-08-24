step-by-step guide with complete code examples for creating a simple bootloader and a minimal Linux system that runs a shell script.

Overview
Write a Bootloader: A simple bootloader in Assembly that loads the kernel and transfers control to it.
Prepare a Minimal Linux Kernel: Download and compile a basic Linux kernel.
Create an Initrd Image: Include a shell script and necessary binaries in the initrd.
Combine Everything: Use GRUB to create a bootable ISO.
Step-by-Step Guide
1. Write the Bootloader

bootloader.asm:

```asm
BITS 16
ORG 0x7C00

start:
    ; Set up the stack
    xor ax, ax
    mov ss, ax
    mov sp, 0x7C00

    ; Print loading message
    mov si, msg
    call print_string

    ; Load kernel (this is simplified; real bootloaders would do this differently)
    ; For demonstration, we assume the kernel is located at 0x1000:0
    jmp 0x1000:0

print_string:
    lodsb
    or al, al
    jz .done
    mov ah, 0x0E
    int 0x10
    jmp print_string
.done:
    ret

msg db 'Loading kernel...', 0

TIMES 510-($-$$) db 0
DW 0xAA55
```
Compile the Bootloader:

```bash
nasm -f bin bootloader.asm -o bootloader.bin
```
2. Prepare a Minimal Linux Kernel

Download and Compile the Linux Kernel: You can use a precompiled kernel for simplicity. Download a Linux kernel, e.g., from Alpine Linux:

```bash
curl -O https://dl-cdn.alpinelinux.org/alpine/latest-stable/main/x86_64/linux-virt-5.10.104-r0.apk
Extract the Kernel:
```
```bash
mkdir -p kernel_pkg
cd kernel_pkg
ar x ../linux-virt-5.10.104-r0.apk
tar -xzf data.tar.gz
```
Copy the Kernel Image:
```bash
bash
Copy code
cp boot/vmlinuz-virt ../kernel/
cd ..
```
3. Create Initrd with a Shell Script

Create Directory Structure for Initrd:

```
mkdir -p initrd/{bin,dev,etc,proc,sys,tmp}
```
Copy Required Binaries: For simplicity, copy a minimal set of binaries to initrd/bin. Here, we assume you have a compatible busybox binary that includes sh.

Write the Shell Script: script.sh:

```bash
#!/bin/sh
echo "Hello from the initrd script!"
/bin/sh
```
Make the Script Executable:

```bash
chmod +x initrd/tmp/script.sh
```
Create Init Script: initrd/init:
```bash
#!/bin/sh
/tmp/script.sh
```
Make the Init Script Executable:

```bash
chmod +x initrd/init
```
Create the Initrd Image:

```bash
cd initrd
find . | cpio -o -H newc | gzip > ../initrd.img
cd ..
```
4. Set Up GRUB Configuration

Create a GRUB Configuration File: grub.cfg:

```cfg
menuentry 'Custom Linux' {
    set root='(hd0,1)'
    linux /boot/vmlinuz root=/dev/ram0
    initrd /boot/initrd.img
}
```
Prepare the ISO Directory Structure:

```bash
mkdir -p iso/boot/grub
cp bootloader.bin iso/boot/
cp kernel/vmlinuz iso/boot/
cp initrd.img iso/boot/
cp grub.cfg iso/boot/grub/
```
Create the Bootable ISO:

```bash
grub-mkrescue -o custom_linux.iso iso/
```
5. Write the ISO to a USB Drive (Linux Environment)

If you are on Linux, you can use dd to write the ISO to a USB drive:

```
sudo dd if=custom_linux.iso of=/dev/sdX bs=4M
```
Replace /dev/sdX with the appropriate USB device identifier.

Summary
Bootloader: The Assembly code initializes the system and loads the kernel.
Kernel: Downloaded or compiled, and placed in the boot directory.
Initrd: Contains the shell script and necessary binaries.
GRUB Configuration: Directs GRUB to use the kernel and initrd.
ISO Creation: Combines everything into a bootable ISO using GRUB.
This setup assumes basic knowledge of creating bootable media and working with Linux tools. For real-world applications, additional steps might be required based on specific needs and hardware compatibility.
