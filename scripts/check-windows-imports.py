"""Read a PE import table and report unavailable Windows DLL entry points.

Diagnostic only: does not execute the target binary or change system settings.
"""
import ctypes
import glob
import struct
import sys
from pathlib import Path


def inspect(filename):
    data = Path(filename).read_bytes()
    word = lambda offset: struct.unpack_from('<H', data, offset)[0]
    dword = lambda offset: struct.unpack_from('<I', data, offset)[0]
    pe = dword(0x3C)
    optional = pe + 24
    is_64 = word(optional) == 0x20B
    section_start = optional + word(pe + 20)
    sections = []
    for index in range(word(pe + 6)):
        start = section_start + index * 40
        sections.append((dword(start + 12), max(dword(start + 8), dword(start + 16)), dword(start + 20)))

    def offset(rva):
        for address, size, raw in sections:
            if address <= rva < address + size:
                return raw + rva - address
        return rva

    def string(position):
        return data[position:data.index(0, position)]

    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.GetProcAddress.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    kernel.GetProcAddress.restype = ctypes.c_void_p
    imports = dword(optional + (112 if is_64 else 96) + 8)
    cursor = offset(imports)
    print(f'Inspecting {Path(filename).name}')
    while dword(cursor + 12):
        dll = string(offset(dword(cursor + 12))).decode('ascii')
        thunk = offset(dword(cursor) or dword(cursor + 16))
        try:
            library = ctypes.WinDLL(dll)
        except OSError as error:
            print(f'UNAVAILABLE DLL {dll}: {error}')
            cursor += 20
            continue
        missing = []
        while True:
            value = struct.unpack_from('<Q' if is_64 else '<I', data, thunk)[0]
            if not value:
                break
            if value & (1 << (63 if is_64 else 31)):
                name = value & 0xFFFF
                address = kernel.GetProcAddress(library._handle, name)
                label = f'ordinal {name}'
            else:
                name = string(offset(value) + 2)
                address = kernel.GetProcAddress(library._handle, ctypes.cast(ctypes.c_char_p(name), ctypes.c_void_p))
                label = name.decode('ascii')
            if not address:
                missing.append(label)
            thunk += 8 if is_64 else 4
        print(f'{dll}: ' + (f'MISSING {missing}' if missing else 'all direct imports resolve'))
        cursor += 20


if __name__ == '__main__':
    for pattern in sys.argv[1:]:
        for executable in glob.glob(pattern):
            inspect(executable)
